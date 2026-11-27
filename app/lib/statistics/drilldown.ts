import type { StatisticsBroker, StatisticsDataset, StatisticsPeriod, StatisticsYear } from "../../data/statistics-types";
import { intervalContributors, transactionAmount, transactionDate, trendRanges, type StatisticsPeriodRange } from "./calculations";

export const STATISTICS_METRICS = ["listings", "sales", "purchases", "sale_volume", "purchase_volume", "combined_volume"] as const;
export type StatisticsMetric = typeof STATISTICS_METRICS[number];
export const METRIC_LABELS: Record<StatisticsMetric, string> = {
  listings: "Nouveaux Listings", sales: "Transactions de vente", purchases: "Transactions d’achat",
  sale_volume: "Volume de vente", purchase_volume: "Volume d’achat", combined_volume: "Volume total",
};
export type DrilldownInput = { year: StatisticsYear; period: StatisticsPeriod; broker: StatisticsBroker; from?: string | null; to?: string | null; month: string; metric: StatisticsMetric; page: number; revision?: string | null };
export type Contribution = { id: string; kind: "listing" | "sale" | "purchase"; broker: string; date: string; amount: number | null; status: string; address?: string };
export type StatisticsDrilldown = {
  metric: StatisticsMetric; month: string; broker: StatisticsBroker; range: StatisticsPeriodRange;
  count: number; total: number; saleVolume: number; purchaseVolume: number;
  page: number; pageSize: number; revision: string; rows: Contribution[];
};
export const DRILLDOWN_PAGE_SIZE = 25;

export function effectiveTrendRange(range: StatisticsPeriodRange, month: string) {
  return trendRanges(range).find((item) => item.from.slice(0, 7) === month) ?? null;
}

/** Exact same predicates and amount fields as intervalKpis. No writes or presentation-based filtering. */
export function drilldownContributions(dataset: Pick<StatisticsDataset, "listings" | "transactions">, range: StatisticsPeriodRange, broker: StatisticsBroker, metric: StatisticsMetric) {
  const { listings, sales, purchases } = intervalContributors(dataset, range, broker);
  const saleVolume = sales.reduce((sum, item) => sum + (transactionAmount(item) ?? 0), 0);
  const purchaseVolume = purchases.reduce((sum, item) => sum + (transactionAmount(item) ?? 0), 0);
  const transactions = metric === "combined_volume" ? [...sales, ...purchases] : metric === "sales" || metric === "sale_volume" ? sales : purchases;
  const rows: Contribution[] = metric === "listings"
    ? listings.map((item) => ({ id: item.id, kind: "listing", broker: item.broker, date: item.listingDate!, amount: null, status: item.status }))
    : transactions.map((item) => ({ id: item.id, kind: item.type, broker: item.broker, date: transactionDate(item)!, amount: transactionAmount(item), status: item.status }));
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const total = metric === "listings" ? 0 : metric === "combined_volume" ? saleVolume + purchaseVolume : metric === "sales" || metric === "sale_volume" ? saleVolume : purchaseVolume;
  return { rows, count: rows.length, total, saleVolume, purchaseVolume };
}

export function trendCaption(month: string, range: { from: string; to: string }) {
  const title = new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
  const from = range.from > `${month}-01` ? range.from : `${month}-01`;
  const to = range.to < last ? range.to : last;
  return { title, from, to, partial: from !== `${month}-01` || to !== last };
}
