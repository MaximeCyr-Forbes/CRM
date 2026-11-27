import { createHash } from "node:crypto";
import type { StatisticsListingRow, StatisticsTransactionRow } from "../../data/statistics-types";
import { getSupabaseAdmin } from "../supabase/server";
import { quebecDateKey, resolveStatisticsRange, type StatisticsPeriodRange } from "./calculations";
import { DRILLDOWN_PAGE_SIZE, drilldownContributions, effectiveTrendRange, type DrilldownInput, type StatisticsDrilldown } from "./drilldown";

export class StatisticsChangedError extends Error {}

/** Bounded, stable reads under withCRMIdentity's RLS client; never fetch notes or contacts. */
async function readRows(table: "listings" | "transactions", range: StatisticsPeriodRange, input: DrilldownInput) {
  const columns = table === "listings" ? "id,broker,purpose,status,listing_date,address,civic_number,apartment,city"
    : "id,broker,type,status,price,sold_price,notary_date,sale_finalized_at,purchase_finalized_at,address";
  const rows: Record<string, unknown>[] = [];
  // Broad timestamp bounds include Toronto's UTC offset; the shared predicate applies the exact dates.
  const after = new Date(`${range.to}T00:00:00Z`);
  after.setUTCDate(after.getUTCDate() + 2);
  for (let offset = 0; offset < 20_000; offset += 1000) {
    let query = getSupabaseAdmin().from(table).select(columns).order("id").range(offset, offset + 999)
      .in("broker", input.broker === "team" ? ["maxime", "france", "sandrine"] : [input.broker]);
    if (table === "listings") query = query.gte("listing_date", range.from).lte("listing_date", range.to);
    else {
      query = query.or(`and(notary_date.gte.${range.from},notary_date.lte.${range.to}),and(sale_finalized_at.gte.${range.from},sale_finalized_at.lt.${after.toISOString()}),and(purchase_finalized_at.gte.${range.from},purchase_finalized_at.lt.${after.toISOString()})`);
      if (input.metric !== "combined_volume") query = query.eq("type", input.metric === "sales" || input.metric === "sale_volume" ? "sale" : "purchase");
    }
    const { data, error } = await query;
    if (error) throw new Error("Lecture du détail indisponible.");
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
  throw new Error("Trop de dossiers pour cette période. Réduisez la période ou sélectionnez un courtier.");
}

const number = (value: unknown) => value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
export async function getStatisticsDrilldown(input: DrilldownInput, now = new Date()): Promise<StatisticsDrilldown> {
  const range = resolveStatisticsRange({ ...input, now: quebecDateKey(now)! });
  const effective = range && effectiveTrendRange(range, input.month);
  if (!effective) throw new TypeError("Mois ou période invalide.");
  const isListing = input.metric === "listings";
  const raw = await readRows(isListing ? "listings" : "transactions", effective, input);
  const listings = isListing ? raw.map((row) => ({ id: row.id, broker: row.broker, purpose: row.purpose, status: row.status, listingDate: row.listing_date })) as StatisticsListingRow[] : [];
  const transactions = !isListing ? raw.map((row) => ({ id: row.id, broker: row.broker, type: row.type, status: row.status, price: number(row.price), soldPrice: number(row.sold_price), notaryDate: row.notary_date, saleFinalizedAt: row.sale_finalized_at, purchaseFinalizedAt: row.purchase_finalized_at })) as StatisticsTransactionRow[] : [];
  const result = drilldownContributions({ listings, transactions }, effective, input.broker, input.metric);
  const addresses = new Map(raw.map((row) => [row.id, isListing
    ? [row.civic_number, row.address, row.apartment ? `app. ${row.apartment}` : null, row.city].filter(Boolean).join(" ")
    : String(row.address ?? "")]));
  const revision = createHash("sha256").update(JSON.stringify(result.rows)).digest("hex");
  if (input.revision && input.revision !== revision) throw new StatisticsChangedError("Les dossiers ont changé. Actualisez le détail pour reprendre à la première page.");
  return { ...result, metric: input.metric, month: input.month, broker: input.broker, range: effective,
    revision, page: input.page, pageSize: DRILLDOWN_PAGE_SIZE,
    rows: result.rows.slice((input.page - 1) * DRILLDOWN_PAGE_SIZE, input.page * DRILLDOWN_PAGE_SIZE).map((row) => ({ ...row, address: addresses.get(row.id) ?? "" })) };
}
