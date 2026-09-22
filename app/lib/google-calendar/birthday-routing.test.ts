import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ contacts: [] as any[], rows: [] as any[], connections: [] as any[], calls: [] as any[], failDelete: false, deleteStatus:404 }));
vi.mock("../google/connection", () => ({ getGoogleConnection: vi.fn(async (broker:string)=>state.connections.find(c=>c.broker===broker) ?? null), googleAuthenticatedRequest: async (connection: any, url: string, init: RequestInit) => {
  state.calls.push({ broker: connection.broker, url, method: init.method });
  return new Response(null, { status: init.method === "DELETE" ? state.failDelete ? 503 : state.deleteStatus : 200 });
} }));
vi.mock("../supabase/server", () => ({ getSupabaseAdmin: () => ({ from: (table: string) => {
  let filters: Array<(r: any) => boolean> = []; let op = "read"; let values: any; let limit=1000;
  const q: any = { select: () => q, limit: (n:number) => { limit=n; return q; }, eq: (k:string,v:any) => { filters.push(r=>r[k]===v); return q; }, neq: (k:string,v:any) => { filters.push(r=>r[k]!==v); return q; }, in: (k:string,v:any[]) => { filters.push(r=>v.includes(r[k])); return q; }, is:(k:string,v:any)=>{ filters.push(r=>r[k]===v); return q; }, update:(v:any)=>{op="update"; values=v; return q;}, delete:()=>{op="delete";return q;}, single:async()=>result(true), then:(resolve:any)=>resolve(result(false)) };
  function result(single:boolean) {
    const source = table === "contacts" ? state.contacts : table === "google_calendar_connections" ? state.connections : state.rows;
    const rows = source.filter(r=>filters.every(f=>f(r))).slice(0,limit);
    if (op==="update") rows.forEach(r=>Object.assign(r,values));
    if (op==="delete") { state.calls.push({ method:"DB_DELETE",broker:rows[0]?.broker }); state.rows=state.rows.filter(r=>!rows.includes(r)); }
    return { data:structuredClone(single?rows[0]:rows) };
  }
  return q;
} }) }));
import { syncContactBirthdays } from "./service";
beforeEach(()=> {
  state.contacts=[{ id:"c",first_name:"Test",last_name:"Exemple",birth_date:"1980-09-22",broker:"france" }];
  state.rows=["france","maxime","sandrine"].map(broker=>({contact_id:"c",broker,google_calendar_event_id:`event-${broker}`,sync_status:"pending"}));
  state.connections=["france","maxime","sandrine"].map(broker=>({broker,calendar_id:"primary"})); state.calls=[]; state.failDelete=false; state.deleteStatus=404;
});
it.each(["france","maxime","sandrine"])("reconciles only %s",async broker=>{
  state.contacts[0].broker=broker; await syncContactBirthdays({contactIds:["c"]});
  expect(state.rows).toHaveLength(1);expect(state.rows[0].broker).toBe(broker);
  expect(state.calls.filter(c=>c.method==="PUT").map(c=>c.broker)).toEqual([broker]);
  for(const b of ["france","maxime","sandrine"].filter(b=>b!==broker)) expect(state.calls.findIndex(c=>c.broker===b&&c.method==="DELETE")).toBeLessThan(state.calls.findIndex(c=>c.broker===b&&c.method==="DB_DELETE"));
});
it("unassigned deletes all and creates none",async()=>{state.contacts[0].broker="unassigned";await syncContactBirthdays({contactIds:["c"]});expect(state.rows).toEqual([]);expect(state.calls.some(c=>c.method==="POST"||c.method==="PUT")).toBe(false);});
it("removal deletes Google first",async()=>{state.contacts[0].birth_date=null;await syncContactBirthdays({contactIds:["c"]});expect(state.rows).toEqual([]);expect(state.calls.filter(c=>c.method==="DELETE")).toHaveLength(3);});
it("changed date updates the same Google ID",async()=>{state.rows=state.rows.slice(0,1);state.contacts[0].birth_date="1980-09-23";await syncContactBirthdays({contactIds:["c"]});expect(state.rows[0].google_calendar_event_id).toBe("event-france");expect(state.calls[0]).toMatchObject({method:"PUT",url:expect.stringContaining("event-france")});});
it("move cleans old before new",async()=>{state.rows=state.rows.slice(0,2);state.rows[1].google_calendar_event_id=null;state.contacts[0].broker="maxime";await syncContactBirthdays({contactIds:["c"]});expect(state.calls.map(c=>c.method)).toEqual(["DELETE","DB_DELETE","POST"]);});
it("disconnected old broker retains ID and blocks new calendar",async()=>{state.rows=state.rows.slice(0,2);state.rows[1].google_calendar_event_id=null;state.contacts[0].broker="maxime";state.connections=state.connections.filter(c=>c.broker!=="france");await syncContactBirthdays({contactIds:["c"]});expect(state.rows[0]).toMatchObject({google_calendar_event_id:"event-france",sync_status:"error"});expect(state.calls).toEqual([]);});
it("Google delete failure never discards its mapping",async()=>{state.failDelete=true;state.contacts[0].broker="unassigned";await syncContactBirthdays({contactIds:["c"]});expect(state.rows).toHaveLength(3);expect(state.calls.some(c=>c.method==="DB_DELETE")).toBe(false);});

import { deleteBirthdayEventsForContact, deleteMortgageRenewalEventsForContact } from "./service";
it.each([404,410])("contact birthday cleanup accepts Google %s",async status=>{state.deleteStatus=status;await deleteBirthdayEventsForContact("c");expect(state.rows).toHaveLength(0);expect(state.calls.filter(c=>c.method==="DELETE")).toHaveLength(3);});
it.each([404,410])("contact mortgage cleanup accepts Google %s",async status=>{state.deleteStatus=status;await deleteMortgageRenewalEventsForContact("c");expect(state.rows).toHaveLength(0);});
it.each([deleteBirthdayEventsForContact,deleteMortgageRenewalEventsForContact])("disconnected cleanup retains mappings",async cleanup=>{state.connections=[];await expect(cleanup("c")).rejects.toThrow();expect(state.rows).toHaveLength(3);expect(state.calls).toEqual([]);});
it.each([deleteBirthdayEventsForContact,deleteMortgageRenewalEventsForContact])("failed cleanup retains mappings",async cleanup=>{state.failDelete=true;await expect(cleanup("c")).rejects.toThrow();expect(state.rows).toHaveLength(3);});