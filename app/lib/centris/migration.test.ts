import {beforeAll,afterAll,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
let db:PGlite;
const run='11111111-1111-4111-8111-111111111111';
const values={centrisNumber:'12345',broker:'maxime',purpose:'sale',askingPrice:500000,propertyType:'residential',address:'Rue Test',city:'Ville Test'};
const source={key:'key1',standard:'Active',mls:'Active',modified:'2026-11-13T15:00:00Z',agent:'m1',coAgent:'',mediaKey:null};
const apply=async(v=values,s=source,dry=true,eligible=true)=> (await db.query<{result:{action:string;id:string}}>(
 'select public.centris_apply_property($1,$2,$3,$4,$5,$6) result',[v,s,eligible,'maxime',dry,run])).rows[0].result;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create type public.broker_assignment as enum('maxime','sandrine','france','unassigned');
 create table public.contacts(id uuid primary key);
 create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;`);
 for(const file of ['20260819210000_create_listings_foundation.sql','20260819223000_add_listing_marketing_tracking.sql',
 '20260914162119_listing_contract_signed_date.sql','20261113185229_centris_listings_v1.sql']) {
  await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
 }
 // Production already changed the existing RPCs to invoker security.
 await db.exec(readFileSync('supabase/migrations/20261113195516_centris_listings_v2_cron.sql','utf8')
  .replace(/^create extension .*;$/gm, '')); // PGlite does not ship network/scheduler extensions.
 await db.exec(`alter function public.create_listing_with_owners(jsonb,uuid[]) security invoker;
 alter function public.update_listing_with_owners(uuid,jsonb,uuid[]) security invoker;`);
},30000);
afterAll(async()=>{await db?.close();});
it('records a system run without inventing a member and shares the manual lock',async()=>{
 const cronRun='33333333-3333-4333-8333-333333333333';
 expect((await db.query<{ok:boolean}>('select centris_start_sync($1,null) ok',[cronRun])).rows[0].ok).toBe(true);
 expect((await db.query('select actor,trigger_source from centris_sync_runs where id=$1',[cronRun])).rows[0]).toEqual({actor:null,trigger_source:'cron'});
 expect((await db.query<{ok:boolean}>('select centris_start_sync($1,$1) ok',[run])).rows[0].ok).toBe(false);
 await db.query("select centris_finish_sync($1,'success','{}')",[cronRun]);
 await db.query('delete from centris_sync_runs where id=$1',[cronRun]);
});
it('dry run produces a plan without changing any listing, tracking, run or mapping',async()=>{
 expect((await apply()).action).toBe('created');
 for(const table of ['listings','listing_activity','listing_price_history','listing_marketing_tasks','centris_sync_runs','centris_member_mappings']) {
  expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
 }
 expect((await apply(values,{...source,key:'closed'},true,false)).action).toBe('skipped');
});
it('requires a persistent lease and prevents simultaneous runs',async()=>{
 await expect(apply(values,source,false)).rejects.toThrow('lease');
 expect((await db.query<{ok:boolean}>('select centris_start_sync($1,$1) ok',[run])).rows[0].ok).toBe(true);
 expect((await db.query<{ok:boolean}>('select centris_start_sync($1,$1) ok',['22222222-2222-4222-8222-222222222222'])).rows[0].ok).toBe(false);
});
it('ten repeated syncs preserve one listing and one initial price entry',async()=>{
 expect((await apply(values,source,false)).action).toBe('created');
 for(let i=0;i<10;i++) expect((await apply(values,source,false)).action).toBe('unchanged');
 expect((await db.query('select * from listings')).rows).toHaveLength(1);
 expect((await db.query('select * from listing_price_history')).rows).toHaveLength(1);
});
it('updates price once while preserving owner, notes, checklist, visit and operational status',async()=>{
 const id=(await apply()).id;
 await db.query("update listings set general_notes='Keep me',status='conditional',public_url='https://example.test/internal' where id=$1",[id]);
 await db.exec(`insert into contacts values('${run}');`);
 await db.query('insert into listing_contacts(listing_id,contact_id) values($1,$2)',[id,run]);
 await db.query("insert into listing_visits(listing_id,visit_date,feedback) values($1,'2026-11-14','Keep visit')",[id]);
 const tasks=(await db.query('select * from listing_marketing_tasks order by id')).rows;
 const changed={...values,askingPrice:490000,generalNotes:'erase',status:'sold',publicUrl:''};
 expect((await apply(changed,source,false)).action).toBe('updated');
 expect((await apply(changed,source,false)).action).toBe('unchanged');
 expect((await db.query('select general_notes,status,public_url from listings')).rows[0]).toEqual({general_notes:'Keep me',status:'conditional',public_url:'https://example.test/internal'});
 expect((await db.query('select * from listing_contacts')).rows).toHaveLength(1);
 expect((await db.query('select * from listing_visits')).rows).toHaveLength(1);
 expect((await db.query('select * from listing_marketing_tasks order by id')).rows).toEqual(tasks);
 expect((await db.query('select * from listing_price_history')).rows).toHaveLength(2);
});
it('closed source never finalizes or deletes an existing CRM listing',async()=>{
 expect((await apply({...values,askingPrice:490000},{...source,standard:'Closed',mls:'Sold'},false,false)).action).toBe('updated');
 expect((await db.query('select status,centris_mls_status from listings')).rows[0]).toEqual({status:'conditional',centris_mls_status:'Sold'});
});
it('rejects identity collisions and safely adopts an exact legacy listing number',async()=>{
 expect((await apply(values,{...source,key:'different-key'},false)).action).toBe('conflict');
 await db.query("insert into listings(centris_number,broker,address) values('67890','france','Legacy')");
 expect((await apply({...values,centrisNumber:'67890'},{...source,key:'legacy'},false)).action).toBe('updated');
 expect((await db.query("select count(*)::int n from listings where centris_number='67890'")).rows[0]).toEqual({n:1});
 expect((await apply({...values,centrisNumber:'67890'},source,false)).action).toBe('conflict');
});
it('preserves finalized records and ignores older source versions',async()=>{
 expect((await apply(values,{...source,modified:'2026-11-12T00:00:00Z'},false)).action).toBe('unchanged');
 await db.exec("update listings set status='sold' where centris_listing_key='key1'");
 expect((await apply(values,source,false)).action).toBe('skipped');
});
it('forbids direct anonymous/member mutation of sync machinery',async()=>{
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await expect(db.query('select * from centris_member_mappings')).rejects.toThrow();
  await expect(apply()).rejects.toThrow();
  await db.exec('reset role');
 }
 await db.query("select centris_finish_sync($1,'success','{}')",[run]);
 await expect(apply(values,source,false)).rejects.toThrow('lease');
});
