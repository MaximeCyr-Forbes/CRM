import { beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], next: 0 }));
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
vi.mock("../supabase/server", () => ({ getSupabaseAdmin: () => ({ from: (table: string) => {
  const filters: [string, unknown][] = []; let operation = "select"; let values: Record<string, unknown> = {};
  const source = () => table === "transactions" ? [{ id: a }, { id: b }] : store.rows;
  const matches = (r: Record<string, unknown>) => filters.every(([key, value]) => r[key] === value);
  const run = () => {
    if (operation === "insert") { const row = { ...values, id: `33333333-3333-4333-8333-${String(++store.next).padStart(12, "0")}` }; store.rows.push(row); return [row]; }
    const rows = source().filter(matches);
    if (operation === "update") rows.forEach(row => Object.assign(row, values));
    if (operation === "delete") store.rows = store.rows.filter(row => !matches(row));
    return rows;
  };
  const q = { select: () => q, eq: (k: string, v: unknown) => { filters.push([k,v]); return q; }, order: () => q,
    range: async () => ({ data: run(), error: null }), maybeSingle: async () => ({ data: run()[0] ?? null, error: null }), single: async () => ({ data: run()[0], error: null }),
    insert: (v: Record<string,unknown>) => { operation = "insert"; values = v; return q; }, update: (v: Record<string,unknown>) => { operation = "update"; values = v; return q; }, delete: () => { operation = "delete"; return q; } };
  return q;
} }) }));
import { deleteDirectClient, listDirectClients, saveDirectClient } from "./direct-clients-server";
beforeEach(() => { store.rows = []; store.next = 0; });
describe("transaction scoped direct client persistence", () => {
  it("isolates reads, duplicates, edits and deletion between transactions", async () => {
    const first = await saveDirectClient(a, { name: "Example A", email: "qa@example.invalid" }, "france");
    expect(await listDirectClients(b)).toEqual([]);
    await expect(saveDirectClient(b, { ...first, name: "Wrong" }, "maxime", true)).rejects.toMatchObject({ status: 404 });
    await expect(deleteDirectClient(b, first.id)).rejects.toMatchObject({ status: 404 });
    const second = await saveDirectClient(b, { name: "Example B", email: "qa@example.invalid" }, "maxime");
    await deleteDirectClient(a, first.id);
    expect(await listDirectClients(b)).toEqual([second]);
  });
  it("warns then allows explicit override", async () => {
    const values = { name: "Example", email: "qa@example.invalid" };
    await saveDirectClient(a, values, "france");
    await expect(saveDirectClient(a, { ...values, email: "QA@EXAMPLE.INVALID" }, "france")).rejects.toMatchObject({ status: 409 });
    await saveDirectClient(a, { ...values, allowDuplicate: true }, "france");
    expect(await listDirectClients(a)).toHaveLength(2);
  });
  it("uses the signed actor and preserves creator on edit", async () => {
    const first = await saveDirectClient(a, { name: "Example", created_by: "maxime", transaction_id: b }, "immoplus");
    expect(first).toMatchObject({ created_by: "immoplus", transaction_id: a });
    const updated = await saveDirectClient(a, { ...first, request_note: "Updated", created_by: "maxime" }, "france", true);
    expect(updated).toMatchObject({ created_by: "immoplus", updated_by: "france", request_note: "Updated" });
  });
  it("supports six successive entries without touching other tables", async () => {
    for (let i=0;i<6;i++) await saveDirectClient(a, { name: `Example ${i}` }, "maxime");
    expect(await listDirectClients(a)).toHaveLength(6);
  });
  it("rejects missing transactions", async () => {
    await expect(listDirectClients("44444444-4444-4444-8444-444444444444")).rejects.toMatchObject({ status: 404 });
  });
});
