import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function testInventoryStock(db,{act,people,check}){
 // Schema fixture omits generated identity metadata; restore it for real inventory writes.
 await db.exec('alter table public.sign_inventory_events alter column id add generated always as identity');
 const client=randomUUID(),session=randomUUID();
 await db.query('insert into auth.oauth_clients(id) values($1)',[client]);
 await db.query('insert into auth.oauth_consents(user_id,client_id) values($1,$2)',[people.maxime.user,client]);
 await db.query('insert into auth.sessions(id,user_id,oauth_client_id) values($1,$2,$3)',[session,people.maxime.user,client]);
 const extra={client_id:client,session_id:session,amr:[{method:'oauth_provider/authorization_code'}]};
 await db.exec(`insert into public.sign_inventory_stock(id,kind,broker,label,total) values
 ('sign:maxime','sign','maxime','Pancartes',5),('sign:france','sign','france','Pancartes',5),
 ('bac','bac',null,'BAC',4),('addon:sold','addon',null,'Vendu',10);
 insert into public.sign_inventory_types(id,label) values('sale','À vendre');`);
 const call=(data)=>act('maxime',async tx=>(await tx.query('select public.crm_mcp_add_inventory_stock($1) r',[data])).rows[0].r,extra);
 const base={action_id:randomUUID(),inventory_type:'sign',broker:'france',quantity:2};
 await check('add stock with verified actor and owner distinct',async()=>{
  const r=await call(base);assert.equal(r.old_total,5);assert.equal(r.new_total,7);assert.equal(r.actor,'maxime');assert.equal(r.id,'sign:france');
 });
 await check('lost response retry adds exactly once',async()=>{const r=await call(base);assert.equal(r.replayed,true);assert.equal(r.new_total,7);});
 await check('idempotency key cannot change quantity',()=>assert.rejects(()=>call({...base,quantity:3}),e=>e.code==='23505'));
 await check('distinct queued additions preserve both deltas',async()=>{
  // PGlite serializes sessions: validates cumulative results, not real lock contention.
  await Promise.all([2,3].map(quantity=>call({...base,action_id:randomUUID(),quantity})));
  assert.equal((await db.query("select total from public.sign_inventory_stock where id='sign:france'")).rows[0].total,12);
 });
 for(const quantity of [0,-1,-5,1.5,'moins 3','2',null])await check('backend rejects quantity '+JSON.stringify(quantity),()=>assert.rejects(()=>call({...base,action_id:randomUUID(),quantity}),e=>e.message==='INVENTORY_ADDITION_MUST_BE_POSITIVE'));
 for(const changes of [{broker:'invented'},{inventory_type:'addon',broker:null,addon_type:'addon:invented'},{inventory_type:'bac',broker:'maxime'},{new_total:0},{actor:'france'},{total:0},{inventory_type:'sign',broker:null}])await check('backend rejects invalid target/absolute/actor '+JSON.stringify(changes),()=>assert.rejects(()=>call({...base,...changes,action_id:randomUUID()}),e=>e.code==='22023'));
 await check('BAC addition',async()=>{const r=await call({action_id:randomUUID(),inventory_type:'bac',quantity:5});assert.equal(r.new_total,9);});
 await check('existing addon addition',async()=>{const r=await call({action_id:randomUUID(),inventory_type:'addon',addon_type:'addon:sold',quantity:5});assert.equal(r.new_total,15);});
 await check('existing assignment and return preserve increased total',async()=>{
  const listing=randomUUID(),id=randomUUID();await db.query("insert into public.listings(id,address,broker) values($1,'Synthetic property','france')",[listing]);
  const rpc=(action,data)=>act('maxime',tx=>tx.query('select public.crm_inventory_write($1,$2,$3)',[action,data,'maxime']),extra);
  await rpc('assign',{id,listing_id:listing,broker:'france',sign_type:'sale',has_bac:true,addons:['addon:sold']});
  const r=await call({...base,action_id:randomUUID(),quantity:1});assert.equal(Number(r.used),1);assert.equal(Number(r.available),12);assert.equal(r.new_total,13);
  await rpc('return',{id,version:1});
  assert.equal((await db.query("select total,used from public.sign_inventory_availability() where id='sign:france'")).rows[0].used,0);
 });
 await check('audit contains action, actor, delta and totals',async()=>{
  const r=(await db.query("select * from public.sign_inventory_events where after_data->>'action_id'=$1",[base.action_id])).rows;
  assert.equal(r.length,1);assert.equal(r[0].created_by,'maxime');assert.equal(r[0].after_data.source,'chatgpt_mcp');assert.equal(r[0].after_data.quantity,2);assert.equal(r[0].before_data.total,5);assert.equal(r[0].after_data.new_total,7);
  const ledger=(await db.query('select * from crm_integration.actions where action_id=$1',[base.action_id])).rows[0];assert.equal(ledger.status,'succeeded');assert.equal(ledger.member_id,people.maxime.member);
 });
 await check('non MCP login cannot invoke additive RPC',()=>assert.rejects(()=>act('maxime',tx=>tx.query('select public.crm_mcp_add_inventory_stock($1)',[base])),e=>e.code==='42501'));
 const c2=randomUUID(),s2=randomUUID();await db.query('insert into auth.oauth_clients(id) values($1)',[c2]);await db.query('insert into auth.oauth_consents(user_id,client_id) values($1,$2)',[people.sandrine.user,c2]);await db.query('insert into auth.sessions(id,user_id,oauth_client_id) values($1,$2,$3)',[s2,people.sandrine.user,c2]);
 await check('broker MCP cannot manage stock',()=>assert.rejects(()=>act('sandrine',tx=>tx.query('select public.crm_mcp_add_inventory_stock($1)',[base]),{...extra,client_id:c2,session_id:s2}),e=>e.code==='42501'));
 await check('failure rolls back ledger and stock',async()=>{
  const bad={...base,action_id:randomUUID(),quantity:100000};await assert.rejects(()=>call(bad),e=>e.message==='INVENTORY_LIMIT_EXCEEDED');assert.equal((await db.query('select * from crm_integration.actions where action_id=$1',[bad.action_id])).rows.length,0);
 });
}
