import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const state = vi.hoisted(() => ({ db: null as PGlite | null }));
// The production persistence function runs against an isolated in-memory database.
vi.mock("../supabase/server", () => ({ getSupabaseAdmin: () => ({ from: (table: string) => {
  expect(table).toBe("custom_email_campaigns");
  return { delete: () => ({ eq: (column: string, id: string) => {
    expect(column).toBe("id");
    return { select: () => ({ maybeSingle: async () => {
      try { const result = await state.db!.query("delete from custom_email_campaigns where id=$1 returning id", [id]); return { data: result.rows[0] ?? null, error: null }; }
      catch (error) { return { data: null, error }; }
    } }) };
  } }) };
} }) }));
import { deleteCustomEmailCampaign } from "./custom-campaign-persistence";
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(`create role anon; create role authenticated; create role service_role;
    create type broker_assignment as enum ('maxime','france','sandrine','unassigned');
    create table contacts (id uuid primary key);
    create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;`);
  for (const file of ["20260824170000_create_custom_email_campaigns.sql", "20260915192658_custom_email_manual_sending.sql"]) {
    await state.db.exec(readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8"));
  }
}, 30000);
afterAll(async () => { await state.db?.close(); });
it.each(["draft", "ready", "paused"])("deletes %s configuration atomically while retaining history and uniqueness", async status => {
  const db = state.db!; const id = crypto.randomUUID(), step = crypto.randomUUID(), contact = crypto.randomUUID(), batch = crypto.randomUUID();
  await db.query("insert into custom_email_campaigns(id,name,status,start_date,fallback_broker) values($1,'QA memory',$2,'2026-11-03','maxime')", [id,status]);
  await db.query("insert into contacts values($1)", [contact]);
  await db.query("insert into custom_email_campaign_contacts(campaign_id,contact_id) values($1,$2)", [id,contact]);
  await db.query("insert into custom_email_campaign_steps(id,campaign_id,step_order) values($1,$2,1)", [step,id]);
  await db.query("insert into custom_email_manual_batches(id,campaign_id,step_id,campaign_name,step_order) values($1,$2,$3,'QA memory',1)", [batch,id,step]);
  await db.query("insert into custom_email_manual_deliveries(batch_id,campaign_id,step_id,contact_id,broker,recipient_email,status,attempt_key,gmail_message_id) values($1,$2,$3,$4,'maxime','qa@example.test','sent',$5,'mock-only')", [batch,id,step,contact,crypto.randomUUID()]);
  expect(await deleteCustomEmailCampaign(id)).toBe(true);
  for (const table of ["custom_email_campaign_steps", "custom_email_campaign_contacts"]) expect((await db.query(`select * from ${table} where campaign_id=$1`, [id])).rows).toHaveLength(0);
  expect((await db.query("select * from contacts where id=$1", [contact])).rows).toHaveLength(1);
  expect((await db.query("select * from custom_email_manual_batches where id=$1", [batch])).rows).toHaveLength(1);
  expect((await db.query("select * from custom_email_manual_deliveries where campaign_id=$1", [id])).rows).toHaveLength(1);
  await expect(db.query("insert into custom_email_manual_deliveries(batch_id,campaign_id,step_id,contact_id,recipient_email,status,attempt_key) values($1,$2,$3,$4,'qa@example.test','pending',$5)", [batch,id,step,contact,crypto.randomUUID()])).rejects.toThrow(/duplicate key/);
  expect(await deleteCustomEmailCampaign(id)).toBe(false);
});
it("rolls back cascading configuration deletion on database error", async () => {
  const db=state.db!, id=crypto.randomUUID();
  await db.query("insert into custom_email_campaigns(id,name) values($1,'QA blocked')", [id]);
  await db.query("insert into custom_email_campaign_steps(campaign_id,step_order) values($1,1)", [id]);
  await db.exec(`create function refuse_qa_delete() returns trigger language plpgsql as $$ begin raise exception 'QA refusal'; end $$;
    create trigger refuse_delete before delete on custom_email_campaign_steps for each row execute function refuse_qa_delete();`);
  await expect(deleteCustomEmailCampaign(id)).rejects.toThrow(/QA refusal/);
  expect((await db.query("select id from custom_email_campaigns where id=$1", [id])).rows).toHaveLength(1);
  expect((await db.query("select id from custom_email_campaign_steps where campaign_id=$1", [id])).rows).toHaveLength(1);
});
