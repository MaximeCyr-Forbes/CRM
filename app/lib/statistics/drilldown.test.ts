import { describe, expect, it } from "vitest";
import type { StatisticsDataset, StatisticsListingRow, StatisticsTransactionRow } from "../../data/statistics-types";
import { calculateStatistics, resolveStatisticsRange } from "./calculations";
import { drilldownContributions, effectiveTrendRange, STATISTICS_METRICS, trendCaption } from "./drilldown";

const listing = (id: string, extra: Partial<StatisticsListingRow> = {}): StatisticsListingRow => ({ id, broker: "maxime", purpose: "sale", status: "active", listingDate: "2026-11-03", createdAt: "2026-11-01T00:00:00Z", ...extra });
const transaction = (id: string, extra: Partial<StatisticsTransactionRow> = {}): StatisticsTransactionRow => ({ id, broker: "maxime", type: "sale", status: "completed", price: 900000, soldPrice: 500000.25, notaryDate: "2026-11-05", saleFinalizedAt: "2026-11-05T12:00:00Z", purchaseFinalizedAt: null, promiseDate: null, createdAt: "2026-01-01T00:00:00Z", ...extra });
const dataset: StatisticsDataset = { contacts: [], offers: [], transactionContacts: [], listingTransactionLinks: [],
  listings: [listing("a"), listing("b", { status: "sold" }), listing("c", { status: "withdrawn", broker: "france" }), listing("old", { listingDate: "2025-11-02" }), listing("late", { listingDate: "2026-11-20" })],
  transactions: [transaction("s1"), transaction("s2", { broker: "france", soldPrice: 2500000.75 }), transaction("pending", { saleFinalizedAt: null }), transaction("cancelled", { status: "cancelled" }), transaction("p1", { type: "purchase", saleFinalizedAt: null, purchaseFinalizedAt: "2026-11-04T12:00:00Z", price: 765432.12 }), transaction("p-pending", { type: "purchase", saleFinalizedAt: null }), transaction("midnight", { notaryDate: null, saleFinalizedAt: "2026-11-01T02:00:00Z" }), transaction("old", { notaryDate: "2025-11-03" }), transaction("late", { notaryDate: "2026-11-20" })] };

describe("concordance graphiques / dossiers", () => {
  for (const broker of ["team", "maxime", "france", "sandrine"] as const) {
    for (const period of ["year", "month", "three_months", "twelve_months", "custom"] as const) {
      it(`${broker} / ${period}: chaque compteur et volume correspond aux mêmes dossiers`, () => {
        const range = resolveStatisticsRange({ year: 2026, period, from: "2026-09-15", to: "2026-11-10", now: "2026-11-27" })!;
        const snapshot = calculateStatistics(dataset, range, broker, "2026-11-27", 2026);
        for (const trend of snapshot.trends) {
          const effective = effectiveTrendRange(range, trend.month)!;
          for (const metric of STATISTICS_METRICS) {
            const detail = drilldownContributions(dataset, effective, broker, metric);
            const expectedCount = metric === "listings" ? trend.listings : metric === "sales" || metric === "sale_volume" ? trend.sales : metric === "combined_volume" ? trend.sales + trend.purchases : trend.purchases;
            expect(detail.count).toBe(expectedCount);
            expect(detail.total).toBe(metric === "listings" ? 0 : metric === "sales" || metric === "sale_volume" ? trend.saleVolume : metric === "combined_volume" ? trend.saleVolume + trend.purchaseVolume : trend.purchaseVolume);
            expect(detail.rows.some((row) => ["pending", "p-pending", "cancelled"].includes(row.id))).toBe(false);
          }
        }
      });
    }
  }
  it("inclut les Listings vendus/retirés et exclut les dates hors période partielle", () => {
    const range = resolveStatisticsRange({ period: "custom", year: 2026, from: "2026-09-15", to: "2026-11-10", now: "2026-11-27" })!;
    expect(drilldownContributions(dataset, effectiveTrendRange(range, "2026-11")!, "team", "listings").rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(effectiveTrendRange(range, "2026-08")).toBeNull();
    expect(trendCaption("2026-09", range)).toMatchObject({ from: "2026-09-15", to: "2026-09-30", partial: true });
    expect(trendCaption("2026-11", range)).toMatchObject({ from: "2026-11-01", to: "2026-11-10", partial: true });
  });
  it("utilise Toronto à minuit, la date notaire prioritaire et les années historiques", () => {
    const range = resolveStatisticsRange({ period: "year", year: 2026, now: "2026-11-27" })!;
    expect(drilldownContributions(dataset, effectiveTrendRange(range, "2026-10")!, "team", "sales").rows.map((r) => r.id)).toEqual(["midnight"]);
    const old = resolveStatisticsRange({ period: "year", year: 2025, now: "2026-11-27" })!;
    expect(drilldownContributions(dataset, effectiveTrendRange(old, "2025-11")!, "team", "sales").rows.map((r) => r.id)).toEqual(["old"]);
  });
  it("préserve les données, le prix vendu et l’ordre déterministe sur plusieurs pages", () => {
    const original = structuredClone(dataset);
    const range = resolveStatisticsRange({ period: "year", year: 2026, now: "2026-11-27" })!;
    const result = drilldownContributions(dataset, range, "team", "sales");
    expect(result.rows.find((row) => row.id === "s1")?.amount).toBe(500000.25);
    expect(dataset).toEqual(original);
    const many = { ...dataset, listings: Array.from({ length: 80 }, (_, i) => listing(String(i).padStart(3, "0"))).reverse() };
    const rows = drilldownContributions(many, range, "team", "listings").rows;
    expect(rows.slice(0, 25).concat(rows.slice(25, 50), rows.slice(50))).toHaveLength(80);
    expect(new Set(rows.map((row) => row.id)).size).toBe(80);
    expect(rows[0].id).toBe("000");
  });
});
