import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function testBusinessPermissions(db) {
 let checks=0;
 const people={}, contacts={}, transactions={};
 const act=async (who,fn,extra={}) => db.transaction(async tx=>{
  const claims={sub:people[who].user,session_id:people[who].session,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,amr:[{method:'oauth'}],...extra};
  await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims)]);
  await tx.exec('set local role authenticated');
  return fn(tx);
 });
 const check=async(name,fn)=>{try{await fn();checks++;}catch(e){throw new Error(name+': '+e.message,{cause:e});}};
 const denied=async(fn)=>assert.rejects(fn,e=>e.code==='42501'||e.code==='P0002');
 for(const broker of ['maxime','france','sandrine']) {
  const user=randomUUID(),session=randomUUID();people[broker]={user,session};
  const email=broker+'@equipeforbesteam.com';
  await db.query('insert into auth.users(id) values($1)',[user]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);
  await db.query('insert into auth.identities(provider_id,user_id,identity_data,provider) values($1,$2,$3,\'google\')',['qa-'+user,user,{email,email_verified:true}]);
  await act(broker,async tx=>{const {rows}=await tx.query('select public.crm_bind_google_identity() m');people[broker].member=rows[0].m.member_id;people[broker].identity=rows[0].m.identity_id;});
  contacts[broker]=randomUUID();transactions[broker]=randomUUID();
  await db.query('insert into public.contacts(id,first_name,broker) values($1,\'QA synthetic\',$2)',[contacts[broker],broker]);
  await db.query('insert into public.transactions(id,address,type,broker) values($1,\'1 Test Street\',\'purchase\',$2)',[transactions[broker],broker]);
  await db.query('insert into public.accounting_broker_balances(broker,balance,updated_by) values($1::text::broker_assignment,0,$1::text) on conflict do nothing',[broker]);
 }
 await check('broker reads own contacts only',()=>act('france',async tx=>assert.equal((await tx.query('select * from public.contacts')).rows.length,1)));
 await check('admin reads team contacts',()=>act('maxime',async tx=>assert.equal((await tx.query('select * from public.contacts')).rows.length,3)));
 await check('cross-broker insert denied',()=>denied(()=>act('france',tx=>tx.query("insert into public.contacts(first_name,broker) values('QA','sandrine')"))));
 await check('cross-broker update hidden',()=>act('france',async tx=>assert.equal((await tx.query("update public.contacts set first_name='forged' where id=$1 returning id",[contacts.sandrine])).rows.length,0)));
 await check('cross-broker delete hidden',()=>act('france',async tx=>assert.equal((await tx.query('delete from public.contacts where id=$1 returning id',[contacts.sandrine])).rows.length,0)));
 await check('broker reassignment denied',()=>denied(()=>act('france',tx=>tx.query("update public.contacts set broker='maxime' where id=$1",[contacts.france]))));
 let created;
 await check('existing contact creation RPC and idempotency',()=>act('france',async tx=>{
  const key=randomUUID(), values={first_name:'Synthetic',broker:'france'};
  const result=await tx.query('select (public.create_manual_contact_with_addresses($1,$2,$3)).id',[values,[],key]);
  created=result.rows[0].id;
  assert.equal((await tx.query('select (public.create_manual_contact_with_addresses($1,$2,$3)).id',[values,[],key])).rows[0].id,created);
 }));
 await check('existing contact RPC rejects cross-broker creation',()=>denied(()=>act('france',tx=>tx.query('select public.create_manual_contact_with_addresses($1,$2,$3)',[{first_name:'Synthetic',broker:'sandrine'},[],randomUUID()]))));
 await check('contact note actor cannot be forged',()=>act('maxime',async tx=>{
  await tx.query("select public.add_contact_note($1,'QA note','france',now())",[contacts.france]);
  const {rows}=await tx.query('select created_by,created_by_user_id from public.client_notes where contact_id=$1',[contacts.france]);
  assert.equal(rows[0].created_by,'maxime');assert.equal(rows[0].created_by_user_id,people.maxime.user);
 }));
 await check('cross-broker note denied',()=>denied(()=>act('sandrine',tx=>tx.query("select public.add_contact_note($1,'QA note','maxime',now())",[contacts.france]))));
 await check('transaction note actor is authenticated user',()=>act('maxime',async tx=>{
  const {rows}=await tx.query('insert into public.transaction_notes(transaction_id,content,created_by_user_id) values($1,\'QA\',$2) returning created_by_user_id',[transactions.france,people.france.user]);
  assert.equal(rows[0].created_by_user_id,people.maxime.user);
 }));
 await check('cross-broker deadline denied',()=>denied(()=>act('france',tx=>tx.query("insert into public.transaction_deadlines(transaction_id,title,due_date) values($1,'QA','2026-11-01')",[transactions.sandrine]))));
 await check('same broker deadline succeeds',()=>act('france',async tx=>assert.equal((await tx.query("insert into public.transaction_deadlines(transaction_id,title,due_date) values($1,'QA','2026-11-01') returning id",[transactions.france])).rows.length,1)));
 await check('direct client author is real actor',()=>act('maxime',async tx=>{
  const {rows}=await tx.query("insert into public.transaction_direct_clients(transaction_id,name,created_by,updated_by) values($1,'Synthetic','france','france') returning created_by,updated_by",[transactions.france]);
  assert.equal(rows[0].created_by,'maxime');assert.equal(rows[0].updated_by,'maxime');
 }));
 await check('team expenses forbidden to broker',()=>denied(()=>act('france',tx=>tx.query("insert into public.accounting_expenses(vendor,created_by,updated_by) values('QA','france','france')"))));
 await check('own expenses and author stamp succeed',()=>act('france',async tx=>{
  const {rows}=await tx.query("insert into public.accounting_expenses(vendor,assigned_broker,created_by,updated_by) values('QA','france','maxime','maxime') returning created_by");assert.equal(rows[0].created_by,'france');
 }));

 await check('balance RPC stamps the actual author',()=>act('maxime',async tx=>{
  await tx.query("select public.accounting_set_broker_balance('france',125,'france',1)");
  const {rows}=await tx.query("select * from public.accounting_broker_balance_history where broker='france' order by version");assert.equal(rows.at(-1).updated_by,'maxime');
 }));
 await check('balance history cannot be deleted',()=>denied(()=>act('maxime',tx=>tx.query('delete from public.accounting_broker_balance_history'))));
 await check('cross-broker balance cannot be changed',async()=>{
  await act('sandrine',async tx=>{const result=await tx.query("select public.accounting_set_broker_balance('france',999,'maxime',2)");assert.equal(result.rows.length,0);});
  const {rows}=await db.query("select balance from public.accounting_broker_balances where broker='france'");assert.equal(Number(rows[0].balance),125);
 });
 await check('invoice metadata hidden across brokers',()=>act('sandrine',async tx=>assert.equal((await tx.query('select * from public.accounting_expense_documents')).rows.length,0)));
 await check('recommendation can be submitted with real author',()=>act('france',async tx=>{
  await tx.query("insert into public.crm_recommendations(title,content,submitted_by) values('QA','QA','maxime')");
 }));
 await check('recommendations private to admin',()=>act('sandrine',async tx=>assert.equal((await tx.query('select * from public.crm_recommendations')).rows.length,0)));
 await check('recommendation author stamped',()=>act('maxime',async tx=>assert.equal((await tx.query('select submitted_by from public.crm_recommendations')).rows[0].submitted_by,'france')));
 await check('legacy inventory RPC is unavailable to bearer clients',()=>denied(()=>act('maxime',tx=>tx.query("select public.sign_inventory_write('stock','{}','maxime')"))));
 await check('inventory wrapper rejects actor impersonation',()=>denied(()=>act('france',tx=>tx.query("select public.crm_inventory_write('stock','{}','maxime')"))));
 await check('inventory stock administration denied to broker',()=>denied(()=>act('france',tx=>tx.query("select public.crm_inventory_write('stock','{}','france')"))));
 await check('encrypted Google credentials cannot be read',()=>denied(()=>act('maxime',tx=>tx.query('select * from public.google_calendar_connections'))));
 await check('immutable audit cannot be forged',()=>denied(()=>act('maxime',tx=>tx.query('delete from crm_auth.audit_events'))));
 await check('business audit retains actual member and identity',async()=>{
  const {rows}=await db.query("select * from crm_auth.audit_events where entity='transaction_notes'");
  assert.equal(rows[0].member_id,people.maxime.member);assert.equal(rows[0].identity_id,people.maxime.identity);
 });
 await check('identity mappings cannot be edited by users',()=>denied(()=>act('maxime',tx=>tx.query('update public.crm_member_auth_identities set active=true'))));
 await check('legacy/non-delegated session cannot use MCP',()=>act('maxime',async tx=>assert.equal((await tx.query('select public.crm_mcp_identity() m')).rows[0].m,null)));
 const client=randomUUID(),oauthSession=randomUUID();
 await db.query('insert into auth.oauth_clients(id) values($1)',[client]);
 await db.query('insert into auth.oauth_consents(user_id,client_id) values($1,$2)',[people.france.user,client]);
 await db.query('insert into auth.sessions(id,user_id,oauth_client_id) values($1,$2,$3)',[oauthSession,people.france.user,client]);
 const delegate={client_id:client,session_id:oauthSession,amr:[{method:'oauth_provider/authorization_code'}]};
 await check('delegated AMR without delegated session is rejected',()=>act('france',async tx=>assert.equal((await tx.query('select public.crm_authenticated_member() m')).rows[0].m,null),{amr:delegate.amr}));
 await check('delegated session requires delegated AMR',()=>act('france',async tx=>assert.equal((await tx.query('select public.crm_mcp_identity() m')).rows[0].m,null),{...delegate,amr:[{method:'oauth'}]}));
 await check('delegated session rejects mismatched client',()=>act('france',async tx=>assert.equal((await tx.query('select public.crm_mcp_identity() m')).rows[0].m,null),{...delegate,client_id:randomUUID()}));
 await check('MCP maps same verified member',()=>act('france',async tx=>assert.equal((await tx.query('select public.crm_mcp_identity() m')).rows[0].m.member_id,people.france.member),delegate));
 const action=randomUUID(),hash='a'.repeat(64);
 await check('MCP idempotent claim',()=>act('france',async tx=>{
  assert.equal((await tx.query('select public.crm_mcp_begin_action($1,$2,$3) r',[action,'crm_add_contact_note',hash])).rows[0].r.claimed,true);
  assert.equal((await tx.query('select public.crm_mcp_begin_action($1,$2,$3) r',[action,'crm_add_contact_note',hash])).rows[0].r.claimed,false);
 },delegate));
 await check('MCP bearer cannot forge completion audit',()=>denied(()=>act('france',tx=>tx.query("select public.crm_mcp_finish_action($1,$2,'succeeded','{}')",[people.france.member,action]),delegate)));
 await db.query('update auth.oauth_consents set revoked_at=now() where user_id=$1 and client_id=$2',[people.france.user,client]);
 await check('MCP revocation immediate before token expiry',()=>act('france',async tx=>{
  assert.equal((await tx.query('select public.crm_mcp_identity() m')).rows[0].m,null);
  assert.equal((await tx.query('select * from public.contacts')).rows.length,0);
 },delegate));
 await check('other broker remains connected after revocation',()=>act('sandrine',async tx=>assert.equal((await tx.query('select * from public.contacts')).rows.length,1)));
 await db.query('update public.crm_member_auth_identities set active=false where id=$1',[people.france.identity]);
 await check('disabled identity immediately loses row access',()=>act('france',async tx=>assert.equal((await tx.query('select * from public.contacts')).rows.length,0)));
 console.log(`PASS: ${checks} business/RLS/MCP security scenarios on local PostgreSQL.`);
}
