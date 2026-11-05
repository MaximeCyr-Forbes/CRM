import {beforeAll,afterAll,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create schema crm_auth;
 create function crm_auth.has_functional_access() returns boolean language sql as $$ select coalesce(current_setting('test.active',true),'false')='true' $$;
 grant usage on schema crm_auth to authenticated;grant execute on function crm_auth.has_functional_access() to authenticated;`);
 const sql=readFileSync('supabase/migrations/20261105213013_crm_acm_tools.sql','utf8').replace('create extension if not exists pgcrypto;','');
 await db.exec(sql);
},30000);
afterAll(async()=>{await db?.close();});
it('active members share analyses while inactive and anonymous users cannot access them',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 await db.exec(`insert into auth.users values('${id}'); set role authenticated;set test.active='true';`);
 await db.query("insert into tool_acm_analyses(owner_id,title,analysis_data) values($1,'QA memory','{}')",[id]);
 expect((await db.query('select * from tool_acm_analyses')).rows).toHaveLength(1);
 await db.exec("set test.active='false'");
 expect((await db.query('select * from tool_acm_analyses')).rows).toHaveLength(0);
 await expect(db.query("insert into tool_acm_analyses(owner_id,title,analysis_data) values($1,'No','{}')",[id])).rejects.toThrow();
 await db.exec('set role anon');await expect(db.query('select * from tool_acm_analyses')).rejects.toThrow();
 await db.exec('reset role');
});
it('maps functions are server-only and reserve persistent limits',async()=>{
 await db.exec('set role authenticated');
 await expect(db.query("select acm_reserve_google_maps_request('geocoding',2,2)")).rejects.toThrow();
 await db.exec('set role service_role');
 const reserve=async()=>((await db.query<{result:{allowed:boolean}}>("select acm_reserve_google_maps_request('geocoding',2,2) result")).rows[0].result);
 expect((await reserve()).allowed).toBe(true);expect((await reserve()).allowed).toBe(true);expect((await reserve()).allowed).toBe(false);
 await db.exec('reset role');
});
