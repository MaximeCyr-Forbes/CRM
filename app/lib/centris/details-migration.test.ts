import {beforeAll,afterAll,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
let db:PGlite;
const run='11111111-1111-4111-8111-111111111111';
const values={centrisNumber:'12345',broker:'maxime',purpose:'sale',askingPrice:500000,propertyType:'residential',address:'Rue Test',city:'Ville Test'};
const source={key:'key1',standard:'Active',mls:'Active',modified:'2026-11-13T15:00:00Z',agent:'m1',coAgent:'',mediaKey:null};
const apply=async(v=values,s=source,dry=true,eligible=true)=> (await db.query<{result:{action:string;id:string;changes:number}}>(
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
 await db.exec("grant select on listings to authenticated;create schema cron;create table cron.job(jobname text,schedule text,active boolean)");
 await db.exec(readFileSync('supabase/migrations/20261113223148_centris_listings_v3_details_history.sql','utf8'));
 await db.query('select centris_start_sync($1,$1)',[run]);
},30000);
afterAll(async()=>{await db?.close();});

it('enrichment creates a baseline without false changes and remains idempotent',async()=>{
 const s={...source,details:{bedrooms_total:3,living_area:72.6,living_area_units:'Square Meters',public_remarks:'Public source'}};
 expect((await apply(values,s,true)).action).toBe('created');
 expect((await db.query('select * from centris_property_details')).rows).toHaveLength(0);
 expect((await apply(values,s,false)).changes).toBe(0);
 for(let i=0;i<10;i++) expect((await apply(values,s,false)).action).toBe('unchanged');
 expect((await db.query('select source,changed_by from listing_price_history')).rows).toEqual([{source:'centris',changed_by:null}]);
 expect((await db.query('select source,actor_broker from listing_activity')).rows).toEqual([{source:'centris',actor_broker:null}]);
 expect((await db.query('select living_area,living_area_units,bedrooms_total from centris_property_details')).rows[0]).toEqual({living_area:'72.6',living_area_units:'Square Meters',bedrooms_total:3});
});
it('logs price transitions once, including return to a former price, without human attribution',async()=>{
 for(const price of [490000,480000,500000]) {
  const v={...values,askingPrice:price};
  expect((await apply(v,source,false)).changes).toBe(1);
  for(let i=0;i<10;i++) expect((await apply(v,source,false)).action).toBe('unchanged');
 }
 const events=(await db.query<{source:string;actor_broker:string|null;source_at:string|null;metadata:{after:number}}>("select source,actor_broker,source_at,metadata from listing_activity where event_type='price_changed' order by created_at")).rows;
 expect(events).toHaveLength(3);
 expect(events.every(e=>e.source==='centris'&&e.actor_broker===null&&e.source_at===null)).toBe(true);
 expect(events.map(e=>(e.metadata as {after:number}).after)).toEqual([490000,480000,500000]);
 expect((await db.query('select * from listing_price_history')).rows).toHaveLength(4);
});
it('uses only pertinent source timestamps and never writes remarks into CRM notes',async()=>{
 await db.exec("update listings set general_notes='Internal note',status='conditional'");
 const s={...source,modified:'2026-11-14T15:00:00Z',details:{price_changed_at:'2026-11-14T14:00:00Z',public_remarks:'New public description'}};
 await apply({...values,askingPrice:470000},s,false);
 expect((await db.query("select source_at = '2026-11-14T14:00:00Z'::timestamptz ok from listing_activity where metadata->>'after'='470000'")).rows[0]).toEqual({ok:true});
 expect((await db.query('select general_notes,status from listings')).rows[0]).toEqual({general_notes:'Internal note',status:'conditional'});
});
it('source status transitions are recorded once without finalizing, removing or altering tracking',async()=>{
 const tasks=(await db.query('select * from listing_marketing_tasks order by id')).rows;
 const s={...source,modified:'2026-11-15T15:00:00Z',standard:'Closed',mls:'Sold'};
 const v={...values,askingPrice:470000};
 expect((await apply(v,s,false,false)).changes).toBe(1);
 expect((await apply(v,s,false,false)).action).toBe('unchanged');
 expect((await db.query('select status,centris_standard_status from listings')).rows[0]).toEqual({status:'conditional',centris_standard_status:'Closed'});
 expect((await db.query("select * from listing_activity where event_type='centris_status_changed'")).rows).toHaveLength(1);
 expect((await db.query('select * from listing_marketing_tasks order by id')).rows).toEqual(tasks);
});
it('unknown status is retained but never drives CRM status; missing price is not zero',async()=>{
 const s={...source,modified:'2026-11-16T15:00:00Z',standard:'Future status',mls:'Future MLS'};
 const before=(await db.query('select * from listing_price_history')).rows.length;
 await apply({...values,askingPrice:null} as unknown as typeof values,s,false,false);
 expect((await db.query('select asking_price,status,centris_standard_status from listings')).rows[0]).toEqual({asking_price:'470000.00',status:'conditional',centris_standard_status:'Future status'});
 expect((await db.query('select * from listing_price_history')).rows).toHaveLength(before);
});
it('manual changes retain their CRM origin and actor after Centris returns',async()=>{
 const id=(await db.query<{id:string}>('select id from listings')).rows[0].id;
 await db.query("select update_listing_with_owners($1,$2,null)",[id,{askingPrice:460000,actorBroker:'france'}]);
 expect((await db.query("select source,changed_by from listing_price_history where amount=460000")).rows[0]).toEqual({source:'crm',changed_by:'france'});
});
it('only the service can read details or scheduler status',async()=>{
 for(const role of ['anon','authenticated']) {
  await db.exec('set role '+role);
  if(role==='anon') await expect(db.query('select * from centris_property_details')).rejects.toThrow();
  else expect((await db.query('select * from centris_property_details')).rows).toHaveLength(0);
  await expect(db.query('select centris_schedule_status()')).rejects.toThrow();
  await expect(apply()).rejects.toThrow();
  await db.exec('reset role');
 }
 expect((await db.query('select centris_schedule_status() ok')).rows[0]).toEqual({ok:false});
 await db.exec("insert into cron.job values('centris-listings-sync-12h','17 11,23 * * *',true)");
 expect((await db.query('select centris_schedule_status() ok')).rows[0]).toEqual({ok:true});
});

it('initial enrichment of an existing V2 listing does not manufacture a price or status event',async()=>{
 await db.query("select create_listing_with_owners($1,array[]::uuid[])",[{...values,centrisNumber:'98765',status:'active',actorBroker:'maxime'}]);
 await db.exec("update listings set centris_listing_key='baseline',centris_standard_status='Active',centris_mls_status='Active' where centris_number='98765'");
 const counts=(await db.query('select (select count(*) from listing_price_history) prices,(select count(*) from listing_activity) events')).rows;
 expect((await apply({...values,centrisNumber:'98765'},{...source,key:'baseline',details:{bedrooms_total:4}} as typeof source,false)).changes).toBe(0);
 expect((await db.query('select (select count(*) from listing_price_history) prices,(select count(*) from listing_activity) events')).rows).toEqual(counts);
});
