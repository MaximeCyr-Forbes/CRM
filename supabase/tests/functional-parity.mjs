import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function testFunctionalParity(db){
 await db.exec("insert into public.sign_inventory_stock(id,kind,broker,label,total) values('sign:sandrine','sign','sandrine','Pancartes',5) on conflict do nothing");
 let count=0;const matrix=[];
 const check=async(name,fn)=>{try{await fn();count++;}catch(e){throw new Error(name+': '+e.message,{cause:e});}};
 const people=(await db.query(`select a.auth_user_id as uid,a.id as identity,m.id as member,m.broker from public.crm_member_auth_identities a join public.crm_members m on m.id=a.member_id where a.auth_user_id is not null`)).rows;
 await db.exec('update public.crm_member_auth_identities set active=true');
 for(const person of people){
  const session=randomUUID(),client=randomUUID(),delegated=randomUUID();
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,person.uid]);
  await db.query('insert into auth.oauth_clients(id) values($1)',[client]);
  await db.query('insert into auth.oauth_consents(user_id,client_id) values($1,$2)',[person.uid,client]);
  await db.query('insert into auth.sessions(id,user_id,oauth_client_id) values($1,$2,$3)',[delegated,person.uid,client]);
  const act=(fn,mcp=false)=>db.transaction(async tx=>{
   await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:person.uid,session_id:mcp?delegated:session,...(mcp?{client_id:client}:{}),role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,amr:[{method:mcp?'oauth_provider/authorization_code':'oauth'}]})]);
   await tx.exec('set local role authenticated');return fn(tx);
  });
  const target=person.broker==='france'?'sandrine':'france';
  await check(person.broker+' all broker contexts',()=>act(async tx=>{const r=(await tx.query('select public.crm_authenticated_member() m')).rows[0].m;assert.equal(r.broker,person.broker);assert.deepEqual(r.brokers,['france','maxime','sandrine']);}));
  await check(person.broker+' all business tables readable',()=>act(async tx=>{
   for(const table of ['contacts','listings','transactions','mortgage_referrals','accounting_expenses','accounting_recurring_expenses','accounting_broker_balances','crm_recommendations','automatic_email_rules','custom_email_campaigns','sign_inventory_stock','google_drive_roots','transaction_deadlines'])await tx.query('select count(*) from public.'+table);
  }));
  let contact,transaction,listing;
  await check(person.broker+' contacts cross broker create/update/reassign/note',()=>act(async tx=>{
   contact=(await tx.query('select (public.create_manual_contact_with_addresses($1,$2,$3)).id',[{first_name:'Synthetic parity',broker:target},[],randomUUID()])).rows[0].id;
   await tx.query('select public.update_contact_with_addresses($1,$2,null)',[contact,{first_name:'Updated parity',broker:'maxime'}]);
   await tx.query("select public.add_contact_note($1,'Synthetic parity note','maxime',now())",[contact]);
   assert.equal((await tx.query('select created_by from public.client_notes where contact_id=$1',[contact])).rows[0].created_by,person.broker);
  }));
  await check(person.broker+' transactions, notes, deadline and direct clients',()=>act(async tx=>{
   transaction=(await tx.query("insert into public.transactions(address,type,broker) values('Synthetic parity','purchase',$1) returning id",[target])).rows[0].id;
   await tx.query('insert into public.transaction_notes(transaction_id,content,created_by_user_id) values($1,$2,$3)',[transaction,'Synthetic parity',person.uid]);
   assert.equal((await tx.query('select created_by_user_id from public.transaction_notes where transaction_id=$1',[transaction])).rows[0].created_by_user_id,person.uid);
   await tx.query("insert into public.transaction_deadlines(transaction_id,title,due_date) values($1,'Synthetic parity','2026-11-01')",[transaction]);
   await tx.query("insert into public.transaction_direct_clients(transaction_id,name,created_by,updated_by) values($1,'Synthetic parity','maxime','maxime')",[transaction]);
  }));
  await check(person.broker+' listings cross broker create/update',()=>act(async tx=>{
   listing=(await tx.query("insert into public.listings(address,broker) values('Synthetic parity',$1) returning id",[target])).rows[0].id;
   assert.equal((await tx.query("update public.listings set address='Updated parity' where id=$1 returning id",[listing])).rows.length,1);
  }));
  await check(person.broker+' mortgage referrals create and update',()=>act(async tx=>{
   const id=(await tx.query("insert into public.mortgage_referrals(broker,transaction_id,mortgage_advisor_name,institution_name) values($1,$2,'Synthetic advisor','Synthetic institution') returning id",[target,transaction])).rows[0].id;
   assert.equal((await tx.query("update public.mortgage_referrals set follow_up_note='Synthetic parity' where id=$1 returning id",[id])).rows.length,1);
  }));
  await check(person.broker+' CRM Drive metadata across brokers',()=>act(async tx=>{
   await tx.query("insert into public.google_drive_roots(broker,folder_id,folder_name) values($1,$2,'Synthetic folder')",[target,randomUUID()]);
  }));
  await check(person.broker+' team accounting read/write',()=>act(async tx=>{
   const r=await tx.query("insert into public.accounting_expenses(vendor,created_by,updated_by) values('Synthetic parity','maxime','maxime') returning id,created_by");assert.equal(r.rows[0].created_by,person.broker);
   assert.equal((await tx.query("update public.accounting_expenses set vendor='Updated parity' where id=$1 returning id",[r.rows[0].id])).rows.length,1);
  }));
  await check(person.broker+' other broker balances with actual actor',()=>act(async tx=>{
   const v=(await tx.query('select version from public.accounting_broker_balances where broker=$1',[target])).rows[0].version;
   await tx.query('select public.accounting_set_broker_balance($1,234,$2,$3)',[target,person.broker,v]);
   assert.equal((await tx.query('select updated_by from public.accounting_broker_balance_history where broker=$1 order by version desc limit 1',[target])).rows[0].updated_by,person.broker);
  }));
  await check(person.broker+' recommendations create/read/complete actor',()=>act(async tx=>{
   const id=(await tx.query("insert into public.crm_recommendations(title,content,submitted_by) values('Synthetic parity','Synthetic parity','maxime') returning id")).rows[0].id;
   const r=(await tx.query("update public.crm_recommendations set is_completed=true,completed_at=now(),completed_by='maxime' where id=$1 returning completed_by",[id])).rows[0];assert.equal(r.completed_by,person.broker);
  }));
  await check(person.broker+' stock editing all materials with version and actor',()=>act(async tx=>{
   for(const row of (await tx.query('select * from public.sign_inventory_stock')).rows){
    await tx.query("select public.crm_inventory_write('stock',$1,$2)",[{id:row.id,total:row.total+1,version:row.version},person.broker]);
    const r=(await tx.query('select * from public.sign_inventory_stock where id=$1',[row.id])).rows[0];assert.equal(r.total,row.total+1);assert.equal(r.updated_by,person.broker);
   }
  }));
  await check(person.broker+' assignment/edit/return, stock invariant unchanged',()=>act(async tx=>{
   const id=randomUUID();const data={id,listing_id:listing,broker:target,sign_type:'sale',has_bac:true,addons:[]};
   await tx.query("select public.crm_inventory_write('assign',$1,$2)",[data,person.broker]);
   await tx.query("select public.crm_inventory_write('edit',$1,$2)",[{...data,version:1,addons:['addon:sold']},person.broker]);
   assert.equal((await tx.query('select updated_by from public.sign_assignments where id=$1',[id])).rows[0].updated_by,person.broker);
   await tx.query("select public.sign_inventory_listings('Updated parity')");
   const row=(await tx.query('select * from public.sign_inventory_stock where id=$1',['sign:'+target])).rows[0];
   await tx.exec('savepoint stock_invariant');
   await assert.rejects(()=>tx.query("select public.crm_inventory_write('stock',$1,$2)",[{id:row.id,total:0,version:row.version},person.broker]),e=>e.code==='P0001');
   await tx.exec('rollback to savepoint stock_invariant');
   await tx.query("select public.crm_inventory_write('return',$1,$2)",[{id,version:2},person.broker]);
   assert.equal((await tx.query('select returned_by from public.sign_assignments where id=$1',[id])).rows[0].returned_by,person.broker);
  }));
  await check(person.broker+' MCP grants and additive stock',()=>act(async tx=>{
   const m=(await tx.query('select public.crm_mcp_identity() m')).rows[0].m;
   assert.equal(m.actor,person.broker);assert.equal(m.can_write,true);assert.equal(m.can_read_team_accounting,true);assert.equal(m.can_manage_recommendations,true);
   const r=(await tx.query('select public.crm_mcp_add_inventory_stock($1) r',[{action_id:randomUUID(),inventory_type:'sign',broker:target,quantity:1}])).rows[0].r;assert.equal(r.actor,person.broker);assert.equal(r.new_total-r.old_total,1);
  },true));
  await check(person.broker+' secrets remain inaccessible',()=>assert.rejects(()=>act(tx=>tx.query('select * from public.google_calendar_connections')),e=>e.code==='42501'));
  await check(person.broker+' disabled member denied',async()=>{
   await db.query('update public.crm_members set active=false where id=$1',[person.member]);
   await act(async tx=>{assert.equal((await tx.query('select public.crm_authenticated_member() m')).rows[0].m,null);assert.equal((await tx.query('select * from public.contacts')).rows.length,0);});
   await db.query('update public.crm_members set active=true where id=$1',[person.member]);
  });
  matrix.push({member:person.broker,contacts:true,listings:true,transactions:true,mortgage_referrals:true,drive_metadata:true,accounting:true,balances:true,recommendations:true,inventory:true,mcp:true,audit:true});
 }
 assert.equal(matrix.length,3);console.log('AUTHORIZED MEMBERS HAVE FUNCTIONAL PARITY',JSON.stringify(matrix));console.log('PASS: '+count+' functional parity scenarios.');
}
