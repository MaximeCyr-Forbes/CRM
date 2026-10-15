import { beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], next: 0 }));
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
vi.mock("../supabase/server", () => ({ getSupabaseAdmin: () => ({ from: (table: string) => {
  const filters: [string, unknown][] = []; let operation = "select"; let values: Record<string, unknown> | Record<string, unknown>[] = {};
  const source = () => table === "transactions" ? [{ id: a }, { id: b }] : store.rows;
  const matches = (r: Record<string, unknown>) => filters.every(([key, value]) => r[key] === value);
  const run = () => {
    if (operation === "insert") { const rows = (Array.isArray(values)?values:[values]).map(value=>({ ...value, id: value.id ?? `33333333-3333-4333-8333-${String(++store.next).padStart(12, "0")}` })); store.rows.push(...rows); return rows; }
    const rows = source().filter(matches);
    if (operation === "update") rows.forEach(row => Object.assign(row, values));
    if (operation === "delete") store.rows = store.rows.filter(row => !matches(row));
    return rows;
  };
  const q = { select: () => q, eq: (k: string, v: unknown) => { filters.push([k,v]); return q; }, order: () => q,
    range: async () => ({ data: run(), error: null }), maybeSingle: async () => ({ data: run()[0] ?? null, error: null }), single: async () => ({ data: run()[0], error: null }),
    then: (resolve: (value: unknown)=>unknown) => Promise.resolve({data:run(),error:null}).then(resolve),
    insert: (v: Record<string,unknown> | Record<string,unknown>[]) => { operation = "insert"; values = v; return q; }, update: (v: Record<string,unknown>) => { operation = "update"; values = v; return q; }, delete: () => { operation = "delete"; return q; } };
  return q;
} }) }));
import { deleteDirectClient, importDirectClients, listDirectClients, saveDirectClient } from "./direct-clients-server";
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
  it("edits notes without warning again about an accepted duplicate", async () => {
    const first = await saveDirectClient(a, { name: "Example", phone: "514-555-0101" }, "france");
    await saveDirectClient(a, { name: "Other", phone: "(514) 555-0101", allowDuplicate: true }, "france");
    const updated = await saveDirectClient(a, { ...first, request_note: "Changed note" }, "france", true);
    expect(updated.request_note).toBe("Changed note");
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

const batch=()=>({clients:Array.from({length:6},(_,i)=>({importId:crypto.randomUUID(),name:'Synthetic '+i,email:'qa'+i+'@example.invalid'}))});
it('imports one validated batch with signed actor and stable retries',async()=>{
 const body=batch();const first=await importDirectClients(a,body,'immoplus');
 expect(first).toHaveLength(6);expect(first.every(r=>r.created_by==='immoplus'&&r.transaction_id===a)).toBe(true);
 expect(await importDirectClients(a,body,'france')).toEqual(first);expect(store.rows).toHaveLength(6);
 expect(await listDirectClients(b)).toEqual([]);
 body.clients[0].name='Changed';await expect(importDirectClients(a,body,'france')).rejects.toMatchObject({status:409});expect(store.rows).toHaveLength(6);
});
it('validates every row before inserting anything',async()=>{
 const body=batch();body.clients[5].email='invalid';await expect(importDirectClients(a,body,'maxime')).rejects.toThrow();expect(store.rows).toHaveLength(0);
});
it('rejects existing and intra-batch duplicates atomically, allows explicit override',async()=>{
 const body=batch();body.clients[5].email=body.clients[0].email;
 await expect(importDirectClients(a,body,'maxime')).rejects.toMatchObject({status:409});expect(store.rows).toHaveLength(0);
 await importDirectClients(a,{clients:body.clients.map(r=>({...r,allowDuplicate:true}))},'maxime');expect(store.rows).toHaveLength(6);
 await expect(importDirectClients(a,batch(),'maxime')).rejects.toMatchObject({status:409});expect(store.rows).toHaveLength(6);
});
it('does not reuse identities across transactions',async()=>{const body=batch();const x=await importDirectClients(a,body,'maxime');const y=await importDirectClients(b,body,'france');expect(x[0].id).not.toBe(y[0].id);});
it('rejects repeated preview identities and empty selections',async()=>{const body=batch();body.clients[1].importId=body.clients[0].importId;await expect(importDirectClients(a,body,'maxime')).rejects.toThrow();await expect(importDirectClients(a,{clients:[]},'maxime')).rejects.toThrow();expect(store.rows).toHaveLength(0);});
