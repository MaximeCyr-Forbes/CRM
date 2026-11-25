import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
let db: PGlite;
const cid = "11111111-1111-4111-8111-111111111111", mid = "22222222-2222-4222-8222-222222222222", other = "33333333-3333-4333-8333-333333333333";
const version = "2026-11-20T12:00:00Z";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema crm_auth; grant usage on schema crm_auth to authenticated;
    create table crm_members(id uuid primary key); insert into crm_members values('${mid}'),('${other}');
    create table contacts(id uuid primary key,broker text,next_follow_up_date date,last_contact_date timestamptz,updated_at timestamptz,google_calendar_event_id text,google_calendar_event_broker text,google_calendar_sync_status text,google_calendar_last_error text);
    create table client_notes(id uuid primary key,contact_id uuid,content text);
    create table google_calendar_connections(broker text,calendar_id text); insert into google_calendar_connections values('france','france-calendar');
    create function crm_auth.member_identity() returns jsonb language sql stable as $$ select case when current_setting('test.denied',true)='yes' then null else jsonb_build_object('member_id',coalesce(nullif(current_setting('test.actor',true),''),'${mid}'),'broker','maxime') end $$;
    create function crm_auth.can_access(b text) returns boolean language sql stable as $$ select b='france' and crm_auth.member_identity() is not null $$;
    alter table contacts enable row level security;
    create policy contacts_access on contacts to authenticated using(crm_auth.can_access(broker));
    grant select,update on contacts to authenticated;
    create function touch_contact() returns trigger language plpgsql as $$begin new.updated_at:=clock_timestamp();return new;end;$$;
    create trigger touch_contact before update on contacts for each row execute function touch_contact();`);
  await db.exec(readFileSync("supabase/migrations/20261125221641_contact_follow_up_completions.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`reset role; set test.denied='no'; set test.actor='${mid}'; truncate contacts,client_notes,contact_follow_up_completions;
    insert into contacts values('${cid}','france',current_date-5,'2026-10-01','${version}','event-old','france','synced',null);
    insert into client_notes values('${cid}','${cid}','Synthetic note'); set role authenticated;`);
});
const contact = async () => (await db.query<any>("select to_jsonb(c) value from contacts c where id=$1", [cid])).rows[0].value;
const history = async () => (await db.query<any>("select * from contact_follow_up_completions order by completed_at desc")).rows;
const complete = async (scheduled?: string, v = version) => (await db.query<{ value: any }>("select complete_contact_follow_up($1,$2,$3) value", [cid, scheduled ?? (await contact()).next_follow_up_date, v])).rows[0].value;
const revert = async (id: string) => (await db.query<{ value: any }>("select revert_contact_follow_up($1,$2) value", [cid, id])).rows[0].value;

it("today and overdue dates are separate from real server completion, with authenticated actor", async () => {
  const c = await contact();
  const e = await complete();
  expect(e.scheduled_for).toBe(c.next_follow_up_date);
  expect(Date.now() - Date.parse(e.completed_at)).toBeLessThan(10_000);
  expect(e.completed_by_member_id).toBe(mid); expect(e.completed_by_broker).toBe("maxime"); expect(e.contact_broker).toBe("france");
  expect((await contact()).next_follow_up_date).toBeNull();
  expect((await contact()).last_contact_date).toEqual(c.last_contact_date);
  expect((await history()).length).toBe(1);
  expect(e.google_event_id).toBe("event-old"); expect(e.google_calendar_id).toBe("france-calendar");
  expect((await contact()).google_calendar_event_id).toBeNull();
  await db.exec("update contacts set next_follow_up_date=current_date");
  const fresh = await contact();
  const today = await complete(fresh.next_follow_up_date, fresh.updated_at);
  expect(today.id).not.toBe(e.id); expect((await history()).length).toBe(2);
});
it("double click and concurrent completion produce one immutable event", async () => {
  const scheduled = (await contact()).next_follow_up_date;
  const results = await Promise.all([complete(scheduled), complete(scheduled)]);
  expect(results[0].id).toBe(results[1].id); expect((await history()).length).toBe(1);
  expect((await complete(scheduled)).id).toBe(results[0].id);
});
it("another authorized actor reads the same history and cannot forge the author", async () => {
  const event = await complete();
  await db.exec(`set test.actor='${other}'`);
  expect((await history())[0].completed_by_member_id).toBe(mid);
  expect((await complete(event.scheduled_for)).id).toBe(event.id);
  const result = await revert(event.id);
  expect(result.completion.reverted_by_member_id).toBe(other);
});
it("rescheduling wins cleanly against a stale completion", async () => {
  const c = await contact();
  await db.exec("update contacts set next_follow_up_date=current_date+7");
  await expect(complete(c.next_follow_up_date)).rejects.toThrow("FOLLOWUP_STALE");
  expect((await history()).length).toBe(0);
});
it("removing a date creates no completion and cannot be marked done", async () => {
  const c = await contact();
  await db.exec("update contacts set next_follow_up_date=null");
  await expect(complete(c.next_follow_up_date)).rejects.toThrow("FOLLOWUP_STALE");
  expect((await history()).length).toBe(0);
});
it("undo restores the scheduled date, preserves audit, and cannot run twice", async () => {
  const e = await complete();
  const result = await revert(e.id);
  expect(result.restored).toBe(true); expect(result.completion.reverted_at).toBeTruthy();
  expect((await contact()).next_follow_up_date).toBe(e.scheduled_for);
  expect((await revert(e.id)).restored).toBe(false);
  expect((await history()).length).toBe(1);
  await expect(complete(e.scheduled_for)).rejects.toThrow("FOLLOWUP_STALE");
});
it("undo never overwrites a new follow-up or its new Google link", async () => {
  const e = await complete();
  await db.exec("update contacts set next_follow_up_date=current_date+10,google_calendar_event_id='new-event'");
  const before = await contact();
  expect((await revert(e.id)).restored).toBe(false);
  expect(await contact()).toEqual(before);
});
it("undoing older history cannot restore an obsolete follow-up after a later completion", async () => {
  const first = await complete();
  await db.exec("update contacts set next_follow_up_date=current_date+1");
  const c = await contact(); await complete(c.next_follow_up_date, c.updated_at);
  expect((await revert(first.id)).restored).toBe(false);
  expect((await contact()).next_follow_up_date).toBeNull();
});
it("history cannot be edited or deleted directly by an authenticated user", async () => {
  await complete();
  await expect(db.exec("delete from contact_follow_up_completions")).rejects.toThrow(/permission denied/);
  await expect(db.exec("update contact_follow_up_completions set completed_by_broker='sandrine'")).rejects.toThrow(/permission denied/);
});
it("inaccessible and anonymous contacts are refused, including history", async () => {
  await complete();
  await db.exec("set test.denied='yes'");
  expect(await history()).toEqual([]);
  await expect(complete("2026-11-20")).rejects.toThrow("FORBIDDEN");
  await db.exec("reset role; set role anon");
  await expect(history()).rejects.toThrow(/permission denied/);
  await expect(complete("2026-11-20")).rejects.toThrow(/permission denied/);
});
it("notes survive completion and undo unchanged", async () => {
  const e = await complete(); await revert(e.id);
  await db.exec("reset role");
  expect((await db.query<any>("select content from client_notes")).rows).toEqual([{ content: "Synthetic note" }]);
});
it("a SQL failure rolls back both the history insert and date removal", async () => {
  await db.exec("reset role; create function reject_followup_test() returns trigger language plpgsql as $$begin raise exception 'test failure';end;$$; create trigger reject_followup_test before update on contacts for each row execute function reject_followup_test(); set role authenticated;");
  const before = await contact();
  try {
    await expect(complete()).rejects.toThrow("test failure");
    expect(await contact()).toEqual(before); expect(await history()).toEqual([]);
  } finally { await db.exec("reset role; drop trigger reject_followup_test on contacts; drop function reject_followup_test(); set role authenticated;"); }
});
