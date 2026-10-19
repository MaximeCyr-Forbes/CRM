import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
const root=new URL('./',import.meta.url);
const fixture=JSON.parse(await readFile(new URL('fixtures/schema-before-google-auth.json',root),'utf8'));
const db=await PGlite.create({extensions:{unaccent}});
let phase='bootstrap';
try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage; create extension unaccent;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create table auth.identities(id uuid primary key default gen_random_uuid(),provider_id text not null,user_id uuid not null references auth.users(id),identity_data jsonb not null,provider text not null);
 create table auth.oauth_clients(id uuid primary key,deleted_at timestamptz);
 create table auth.oauth_consents(user_id uuid,client_id uuid,revoked_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz,oauth_client_id uuid);
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
 create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
 grant usage on schema auth,storage to authenticated,service_role;
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to authenticated;
 set check_function_bodies=off;`);
 for(const t of fixture.enums) await db.exec(`create type public.${t.name} as enum (${t.labels.map(x=>`'${x}'`).join(',')});`);
 phase='tables';for(const t of fixture.tables) await db.exec(`create table public.${t.name}(${t.cols}); alter table public.${t.name} enable row level security; grant all on public.${t.name} to service_role;`);
 phase='constraints';
 for(const c of [...fixture.constraints].sort((a,b)=>Number(a.startsWith('FOREIGN'))-Number(b.startsWith('FOREIGN')))){
  const bits=c.split('|'),name=bits.pop(),table=bits.pop(),definition=bits.join('|');
  await db.exec(`alter table ${table} add constraint "${name}" ${definition};`);
 }
 phase='unique indexes'; for(const idx of JSON.parse(await readFile(new URL('fixtures/business-unique-indexes.json',root),'utf8'))) await db.exec(idx.ddl);
 phase='business functions';for(const f of fixture.functions)await db.exec(f);
 await db.exec('revoke execute on all functions in schema public from public,anon,authenticated; grant execute on all functions in schema public to service_role;');
 phase='business triggers';for(const t of fixture.triggers)await db.exec(t);
 phase='identity migration';await db.exec(await readFile(new URL('../migrations/20261019021416_google_crm_member_identities.sql',root),'utf8'));
 phase='RLS migration';await db.exec(await readFile(new URL('../migrations/20261019022103_crm_member_rls_and_audit.sql',root),'utf8'));
 phase='MCP migration';await db.exec(await readFile(new URL('../migrations/20261019022528_chatgpt_mcp_member_access.sql',root),'utf8'));
 phase='private helper migration';await db.exec(await readFile(new URL('../migrations/20261019023748_auth_private_security_helpers.sql',root),'utf8'));
 phase='delegated session migration';await db.exec(await readFile(new URL('../migrations/20261019033500_verified_delegated_oauth_sessions.sql',root),'utf8'));
 phase='contact policy optimization';await db.exec(await readFile(new URL('../migrations/20261019040449_optimize_contact_member_policy.sql',root),'utf8'));
 phase='additive inventory migration';await db.exec(await readFile(new URL('../migrations/20261019135401_mcp_add_inventory_stock.sql',root),'utf8'));
 phase='identity regression';await db.exec(await readFile(new URL('google_member_identity.sql',root),'utf8'));
 phase='business permission tests';const { testBusinessPermissions }=await import('./business-permissions.mjs');await testBusinessPermissions(db);
 phase='full member access migration';await db.exec(await readFile(new URL('../migrations/20261019221354_full_member_functional_access.sql',root),'utf8'));
 phase='full member identity regression';await db.exec((await readFile(new URL('google_member_identity.sql',root),'utf8')).replace('begin;', 'begin; update public.crm_member_auth_identities set provider_subject=null,auth_user_id=null,active=true;'));
 phase='functional parity';const {testFunctionalParity}=await import('./functional-parity.mjs');await testFunctionalParity(db);
 phase='Google login v3 migration';await db.exec(await readFile(new URL('../migrations/20261019223541_google_login_v3.sql',root),'utf8'));
 phase='Google login v3';const {testGoogleLoginV3}=await import('./google-login-v3.mjs');await testGoogleLoginV3(db);
 phase='Google v3 functional parity';await testFunctionalParity(db);
 console.log('PASS: local PostgreSQL schema (46 business tables), identity and RLS migrations, identity regressions.');
} catch(e) { console.error('FAIL phase:',phase,'code:',e.code,'message:',e.message);process.exitCode=1; }
finally { await db.close(); }
