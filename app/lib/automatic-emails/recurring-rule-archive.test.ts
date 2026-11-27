import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
import { mapAutomaticEmailRuleRow, type AutomaticEmailRuleRow } from "../../data/automatic-email-types";
import { calculateAutomaticEmailOccurrences } from "./calculations";

let db: PGlite;
const sql = (file: string) => readFileSync(`supabase/migrations/${file}`, "utf8");
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create type broker_assignment as enum ('maxime','france','sandrine','unassigned');
    create table contacts(id uuid primary key,birth_date date);
    create table transactions(id uuid primary key,type text,notary_date date,purchase_finalized_at timestamptz);
    create table transaction_contacts(transaction_id uuid,contact_id uuid);
    create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end $$;`);
  await db.exec(sql("20260824103000_create_automatic_email_preparation.sql"));
  const birthday = sql("20260922181929_birthday_workflow.sql");
  await db.exec(birthday.slice(birthday.indexOf("create table public.contact_birthday_greetings"), birthday.indexOf("-- The exception starts OFF")));
  await db.exec(sql("20260922194633_purchase_anniversary_greetings.sql"));
  const migration=sql("20261127191930_recurring_email_rule_archive.sql");
  await db.exec(migration.replace(/commit;\s*$/, "rollback;"));
  expect((await db.query("select column_name from information_schema.columns where table_name='automatic_email_rules' and column_name='archived_at'")).rows).toHaveLength(0);
  await db.exec(migration);
}, 30000);
afterAll(async () => { await db?.close(); });
async function rule(type: string) { return (await db.query<AutomaticEmailRuleRow>("select * from automatic_email_rules where rule_type=$1", [type])).rows[0]; }
async function mutate(r: AutomaticEmailRuleRow, action: string, values: object = r) {
  return (await db.query<AutomaticEmailRuleRow>("select * from mutate_recurring_email_rule($1,$2,$3,$4)", [r.id,r.version,action,JSON.stringify(values)])).rows[0];
}

it.each(["birthday","purchase_anniversary","google_review","mortgage_renewal"])("edits and archives %s, retains history, restores paused without sending", async type => {
  let r = await rule(type);
  r = await mutate(r,"update",{...r,name:`Custom ${type}`,subject_template:"Bonjour {{firstName}}",body_template:"Message modifié",default_broker:"france",trigger_config:type==="google_review"?{delayDays:10,transactionTypes:["purchase"],googleReviewUrl:"https://example.test/review"}:type==="mortgage_renewal"?{leadMonths:3}:r.trigger_config});
  expect(r).toMatchObject({name:`Custom ${type}`,subject_template:"Bonjour {{firstName}}",body_template:"Message modifié",default_broker:"france",version:2});
  const contact = crypto.randomUUID();
  await db.query("insert into contacts values($1,current_date)",[contact]);
  await db.query("insert into automatic_email_deliveries(rule_id,contact_id,broker,recipient_email,occurrence_key,scheduled_for) values($1,$2,'france','qa@example.test',$3,now())",[r.id,contact,crypto.randomUUID()]);
  const history = (await db.query("select * from automatic_email_deliveries order by id")).rows;
  if(type==="birthday" || type==="purchase_anniversary") {
    const flag=type==="birthday"?"birthdayFallbackEnabled":"purchaseAnniversaryFallbackEnabled";
    await db.query("update automatic_email_rules set trigger_config=jsonb_build_object($2::text,true) where id=$1",[r.id,flag]);
    r=await rule(type);
  }
  const archived = await mutate(r,"archive");
  expect(archived.archived_at).toBeTruthy(); expect(archived.status).toBe("paused");
  expect(Object.values(archived.trigger_config)).not.toContain(true);
  expect(await mutate(r,"archive")).toEqual(archived); // stale duplicate is idempotent
  await expect(mutate(r,"update")).rejects.toThrow(/VERSION_CONFLICT/);
  await expect(mutate(archived,"update")).rejects.toThrow(/ARCHIVED/);
  expect(calculateAutomaticEmailOccurrences([mapAutomaticEmailRuleRow(archived)],{contacts:[],transactions:[],transactionContacts:[],connections:[]},"2026-01-01","2026-12-31")).toEqual([]);
  const restored=await mutate(archived,"restore");
  expect(restored).toMatchObject({id:r.id,archived_at:null,status:"paused",name:r.name,subject_template:r.subject_template,body_template:r.body_template});
  expect(restored.trigger_config).toEqual(archived.trigger_config);
  expect((await db.query("select * from automatic_email_deliveries order by id")).rows).toEqual(history);
  expect((await db.query("select * from automatic_email_rules where rule_type=$1",[type])).rows).toHaveLength(1);
});
it("two sessions cannot silently overwrite each other or change the type", async () => {
  const r=await rule("mortgage_renewal");
  const results=await Promise.allSettled([mutate(r,"update",{...r,name:"First"}),mutate(r,"archive")]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  await expect(mutate(await rule("google_review"),"update",{...await rule("google_review"),rule_type:"birthday"})).rejects.toThrow(/TYPE_IMMUTABLE/);
});
it.each(["birthday","purchase_anniversary"])("%s preserves Done, refuses sending while archived and refuses archive during a sending claim", async type => {
  const table=type==="birthday"?"contact_birthday_greetings":"purchase_anniversary_greetings";
  let r=await rule(type);
  const contact=crypto.randomUUID(),transaction=crypto.randomUUID();
  await db.query("insert into contacts values($1,current_date)",[contact]);
  await db.query("insert into transactions(id) values($1)",[transaction]);
  const insert=(status:string)=>db.query(`insert into ${table}(contact_id,occurrence_date,status${type==="birthday"?"":",transaction_id"}) values($1,current_date,$2${type==="birthday"?"":",$3"})`,type==="birthday"?[contact,status]:[contact,status,transaction]);
  await insert("manual_sending");
  await expect(mutate(r,"archive")).rejects.toThrow(/SEND_IN_PROGRESS/);
  await db.query(`update ${table} set status='manual_done' where contact_id=$1`,[contact]);
  const history=(await db.query(`select * from ${table} where contact_id=$1`,[contact])).rows;
  r=await mutate(r,"archive");
  await expect(db.query(`update ${table} set status='auto_sending' where contact_id=$1`,[contact])).rejects.toThrow(/ARCHIVED/);
  await expect(db.query(`select * from ${type==="birthday"?"update_birthday_rule":"update_purchase_anniversary_rule"}($1,'{}',true)`,[r.id])).rejects.toThrow(/ARCHIVED/);
  expect((await db.query(`select * from ${table} where contact_id=$1`,[contact])).rows).toEqual(history);
  r=await mutate(r,"restore");
  await expect(db.query(`update ${table} set status='auto_sending' where contact_id=$1`,[contact])).rejects.toThrow(/FALLBACK_DISABLED/);
});
it("keeps RLS, unique types, restrictive history FK and denies physical deletion",async()=>{
  expect((await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where oid='automatic_email_rules'::regclass")).rows[0].relrowsecurity).toBe(true);
  for(const role of ["authenticated","service_role"]) expect((await db.query<{allowed:boolean}>("select has_table_privilege($1,'automatic_email_rules','DELETE') allowed",[role])).rows[0].allowed).toBe(false);
  expect((await db.query<{allowed:boolean}>("select has_function_privilege('anon','mutate_recurring_email_rule(uuid,integer,text,jsonb)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
  await expect(db.query("delete from automatic_email_rules where rule_type='birthday'")).rejects.toThrow(/foreign key/);
});
it("uses member RLS for all three brokers and denies a non-member",async()=>{
  // Reproduce the existing member policy in isolation; the migration leaves it intact.
  await db.exec(`grant select,update on automatic_email_rules to authenticated;
    create policy member_test on automatic_email_rules to authenticated
    using (current_setting('test.member',true) in ('maxime','france','sandrine'))
    with check (current_setting('test.member',true) in ('maxime','france','sandrine'));`);
  for(const broker of ["maxime","france","sandrine","outsider"]){
    const r=await rule("google_review");
    await db.query("select set_config('test.member',$1,false)",[broker]);
    await db.exec("set role authenticated");
    try {
      const result=await mutate(r,"update",{...r,name:`Member ${broker}`});
      if(broker==="outsider")expect(result).toBeUndefined();else expect(result.name).toBe(`Member ${broker}`);
    } finally {await db.exec("reset role");}
  }
});
