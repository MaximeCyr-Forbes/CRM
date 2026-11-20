import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

let db: PGlite;
const campaign = { name: "Synthetic isolated campaign", status: "draft", executionMode: "approval", senderStrategy: "fixed_broker", fixedBroker: "france", fallbackBroker: null, startDate: "2026-11-20", sendHour: 9, sendMinute: 0 };
const recipient = () => ({ id: randomUUID(), email: `${randomUUID()}@example.test`, firstName: "", lastName: "", broker: null });
const step = () => ({ id: randomUUID(), subjectTemplate: "Hello", bodyTemplate: "Message", delayDaysAfterPrevious: 0 });
async function save(id: string, expected: string | null, manual: unknown[], steps: unknown[], contacts: string[] = []) {
  return db.query("select save_custom_campaign_editor($1,$2,$3,$4,$5,$6)", [id, expected, JSON.stringify(campaign), contacts, JSON.stringify(manual), JSON.stringify(steps)]);
}
async function version(id: string) { return (await db.query<{ stamp: string }>("select updated_at::text stamp from custom_email_campaigns where id=$1", [id])).rows[0].stamp; }
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create type broker_assignment as enum ('maxime','france','sandrine','unassigned');
    create table contacts(id uuid primary key);
    create schema crm_auth;
    grant usage on schema crm_auth to authenticated;
    create function crm_auth.has_functional_access() returns boolean language sql as $$ select coalesce(current_setting('qa.member',true),'false')='true' $$;
    create function crm_auth.audit_change() returns trigger language plpgsql as $$ begin return null; end $$;
    create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$;`);
  for (const file of ["20260824170000_create_custom_email_campaigns.sql", "20260915192658_custom_email_manual_sending.sql", "20261120150000_campaign_manual_recipients.sql"]) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  // Match the existing Production membership policies, without any real identities.
  for (const table of ["custom_email_campaigns","custom_email_campaign_contacts","custom_email_campaign_steps","custom_email_manual_batches","custom_email_manual_deliveries"]) {
    await db.exec(`grant select,insert,update,delete on ${table} to authenticated;
      create policy crm_member_access on ${table} to authenticated using ((select crm_auth.has_functional_access())) with check ((select crm_auth.has_functional_access()));`);
  }
}, 30000);
afterAll(async () => { await db?.close(); });

describe("real PostgreSQL isolated in memory — no Gmail", () => {
  it("saves five manual recipients, reloads, edits and soft-removes atomically", async () => {
    const id=randomUUID(), recipients=Array.from({length:5},recipient), steps=[step()];
    await save(id,null,recipients,steps);
    expect((await db.query("select * from custom_email_campaign_manual_recipients where campaign_id=$1 and removed_at is null",[id])).rows).toHaveLength(5);
    const stamp=await version(id);
    recipients[0].email="changed@example.test";
    await save(id,stamp,recipients.slice(0,4),steps);
    const rows=(await db.query<{email:string;removed_at:string|null}>("select * from custom_email_campaign_manual_recipients where campaign_id=$1",[id])).rows;
    expect(rows).toHaveLength(5); expect(rows.filter(r=>!r.removed_at)).toHaveLength(4);
    expect(rows.some(r=>r.email==="changed@example.test")).toBe(true);
    await expect(save(id,stamp,[],steps)).rejects.toThrow("CAMPAIGN_CONFLICT");
    expect((await db.query("select * from custom_email_campaign_manual_recipients where campaign_id=$1 and removed_at is null",[id])).rows).toHaveLength(4);
  });
  it("rolls back invalid replacement and rejects another campaign's recipient UUID", async () => {
    const id=randomUUID(), other=randomUUID(), r=recipient(), steps=[step()];
    await save(id,null,[r],steps); await save(other,null,[],[step()]);
    await expect(save(other,await version(other),[r],[step()])).rejects.toThrow("RECIPIENT_SCOPE");
    await expect(save(id,await version(id),[{...r,email:"invalid"}],steps)).rejects.toThrow();
    expect((await db.query<{email:string}>("select email from custom_email_campaign_manual_recipients where id=$1",[r.id])).rows[0].email).toBe(r.email);
  });
  it("supports contact-only and mixed selections without creating contacts", async () => {
    const cid=randomUUID(), id=randomUUID(); await db.query("insert into contacts values($1)",[cid]);
    await save(id,null,[],[step()],[cid]);
    await save(id,await version(id),[recipient()],[step()],[cid]);
    expect((await db.query("select * from contacts")).rows).toHaveLength(1);
    expect((await db.query("select * from custom_email_campaign_contacts where campaign_id=$1",[id])).rows).toHaveLength(1);
  });
  it("claims once across two batches, sources and attempts; never retries an uncertain result", async () => {
    const id=randomUUID(), r=recipient(), s=step(), batch=randomUUID(), batch2=randomUUID();
    await save(id,null,[r],[s]);
    for(const b of [batch,batch2]) await db.query("insert into custom_email_manual_batches(id,campaign_id,step_id,campaign_name,step_order) values($1,$2,$3,'Synthetic',1)",[b,id,s.id]);
    const row={batch_id:batch,campaign_id:id,step_id:s.id,contact_id:null,manual_recipient_id:r.id,broker:"france",recipient_email:r.email,status:"pending",attempt_key:randomUUID(),error:"uncertain"};
    const claim=async (value:unknown,retry=false)=>(await db.query<{id:string|null}>("select claim_custom_campaign_recipient($1,$2) id",[JSON.stringify(value),retry])).rows[0].id;
    const first=await claim(row); expect(first).toBeTruthy();
    const results=await Promise.all([claim({...row,batch_id:batch2,attempt_key:randomUUID()}),claim({...row,manual_recipient_id:null,contact_id:randomUUID(),recipient_email:r.email.toUpperCase()})]);
    expect(results).toEqual([null,null]); expect(await claim({...row,attempt_key:randomUUID()},true)).toBeNull();
    await db.query("update custom_email_manual_deliveries set status='failed' where id=$1",[first]);
    expect(await claim({...row,attempt_key:randomUUID()},true)).toBe(first);
    await db.query("update custom_email_manual_deliveries set status='sent',gmail_message_id='mock-only' where id=$1",[first]);
    await save(id,await version(id),[],[s]);
    const historic=(await db.query<{recipient_email:string;status:string}>("select * from custom_email_manual_deliveries where id=$1",[first])).rows[0];
    expect(historic.recipient_email).toBe(r.email); expect(historic.status).toBe("sent");
    expect(await claim({...row,attempt_key:randomUUID()},true)).toBeNull();
    await db.query("delete from custom_email_campaigns where id=$1",[id]);
    expect((await db.query("select * from custom_email_manual_deliveries where id=$1",[first])).rows).toHaveLength(1);
  });
  it("denies anonymous access and enforces verified membership through RLS and RPCs", async () => {
    for(const role of ["anon"]) {
      const result=await db.query<{table_ok:boolean;rpc_ok:boolean}>("select has_table_privilege($1,'custom_email_campaign_manual_recipients','SELECT') table_ok, has_function_privilege($1,'save_custom_campaign_editor(uuid,timestamptz,jsonb,uuid[],jsonb,jsonb)','EXECUTE') rpc_ok",[role]);
      expect(result.rows[0]).toEqual({table_ok:false,rpc_ok:false});
    }
    expect((await db.query<{rls:boolean}>("select relrowsecurity rls from pg_class where relname='custom_email_campaign_manual_recipients'")).rows[0].rls).toBe(true);
    await db.exec("set role authenticated");
    try {
      expect((await db.query("select * from custom_email_campaign_manual_recipients")).rows).toHaveLength(0);
      await expect(save(randomUUID(),null,[recipient()],[step()])).rejects.toThrow("CRM_MEMBER_REQUIRED");
      await db.exec("set qa.member='true'");
      expect((await db.query("select * from custom_email_campaign_manual_recipients")).rows.length).toBeGreaterThan(0);
      const id=randomUUID(); await save(id,null,[recipient()],[step()]);
      expect((await db.query("select * from custom_email_campaign_manual_recipients where campaign_id=$1",[id])).rows).toHaveLength(1);
    } finally { await db.exec("reset role; reset qa.member"); }
  });
});
