import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ data: [] as Record<string, unknown>[], calls: [] as Array<[string, ...unknown[]]>, error: false }));
vi.mock("../supabase/server", () => ({ getSupabaseAdmin: () => ({ from: (table: string) => {
  state.calls.push(["from", table]);
  const query: Record<string, unknown> = {};
  for (const method of ["select", "order", "range", "in", "gte", "lte", "or", "eq"]) query[method] = (...args: unknown[]) => { state.calls.push([method, ...args]); return query; };
  query.then = (resolve: (value: unknown) => unknown) => resolve({ data: state.data, error: state.error ? { message: "private database error" } : null });
  return query;
} }) }));
import { getStatisticsDrilldown, StatisticsChangedError } from "./drilldown-service";
const input = { period: "year" as const, year: 2026 as const, broker: "france" as const, month: "2026-11", metric: "sales" as const, page: 1 };
beforeEach(() => { state.calls = []; state.data = []; state.error = false; });
it("borne les lectures et ne projette que les champs nécessaires sous le client existant", async () => {
  state.data = [{ id: "qa", broker: "france", type: "sale", status: "completed", sold_price: "950000.25", price: 1000000, notary_date: "2026-11-02", sale_finalized_at: "2026-11-02T12:00:00Z", address: "Adresse synthétique", private_notes: "Never return" }];
  const result = await getStatisticsDrilldown(input);
  expect(result.count).toBe(1); expect(result.total).toBe(950000.25);
  expect(result.rows[0].address).toBe("Adresse synthétique");
  expect(JSON.stringify(result)).not.toContain("Never return");
  expect(state.calls).toContainEqual(["in", "broker", ["france"]]);
  expect(state.calls).toContainEqual(["eq", "type", "sale"]);
  expect(state.calls).toContainEqual(["order", "id"]);
  expect(state.calls).toContainEqual(["range", 0, 999]);
  expect(state.calls.filter(([name]) => name === "from")).toEqual([["from", "transactions"]]);
});
it("refuse le mois hors graphique avant toute lecture", async () => {
  await expect(getStatisticsDrilldown({ ...input, month: "2025-11" })).rejects.toThrow(TypeError);
  expect(state.calls).toEqual([]);
});
it("les Listings restent consultables quels que soient leurs statuts, sans lecture des Transactions", async () => {
  state.data = [{ id: "qa", broker: "france", purpose: "sale", status: "sold", listing_date: "2026-11-02", civic_number: "10", address: "Rue Exemple", city: "Ville" }];
  const result = await getStatisticsDrilldown({ ...input, metric: "listings" });
  expect(result.rows[0]).toMatchObject({ address: "10 Rue Exemple Ville", kind: "listing", status: "sold" });
  expect(state.calls).toContainEqual(["gte", "listing_date", "2026-11-01"]);
  expect(state.calls).toContainEqual(["lte", "listing_date", "2026-11-30"]);
  expect(state.calls.filter(([name]) => name === "from")).toEqual([["from", "listings"]]);
});
it("pagine sans tronquer les totaux et détecte les données modifiées entre pages", async () => {
  state.data = Array.from({ length: 52 }, (_, i) => ({ id: String(i).padStart(3, "0"), broker: "france", type: "sale", status: "completed", sold_price: 100, notary_date: "2026-11-02", sale_finalized_at: "2026-11-02T12:00:00Z", address: "Synthétique" }));
  const first = await getStatisticsDrilldown(input);
  const second = await getStatisticsDrilldown({ ...input, page: 2, revision: first.revision });
  const third = await getStatisticsDrilldown({ ...input, page: 3, revision: first.revision });
  expect([first.rows.length, second.rows.length, third.rows.length]).toEqual([25, 25, 2]);
  expect(new Set([...first.rows, ...second.rows, ...third.rows].map((row) => row.id)).size).toBe(52);
  expect(second.total).toBe(5200); expect(second.count).toBe(52);
  state.data.pop();
  await expect(getStatisticsDrilldown({ ...input, page: 2, revision: first.revision })).rejects.toThrow(StatisticsChangedError);
});
it("ne masque jamais une lecture partiellement échouée", async () => {
  state.error = true;
  await expect(getStatisticsDrilldown(input)).rejects.toThrow("Lecture du détail indisponible");
});
