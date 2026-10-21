import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function testAddonWorkflow(db){
 await db.exec('begin');let passed=0;
 try{
  await db.exec("update public.sign_inventory_stock set total=100");
  const tx=randomUUID(),listing=randomUUID();
  await db.query("insert into transactions(id,address,type,broker,status) values($1,'789, Démonstration, Ville, Québec','sale','sandrine','conditions_met')",[tx]);
  await db.query("insert into listings(id,civic_number,address,broker,status) values($1,'456','Rue Exemple','france','sold')",[listing]);
  const search=async q=>(await db.query('select sign_inventory_properties($1) result',[q])).rows[0].result;
  for(const q of ['789 Demonstration','789 rue Démonstration','Rue Démonstration','Démonstration']){assert.ok((await search(q)).some(x=>x.id===tx));passed++;}
  assert.ok((await search('456 Exemple')).some(x=>x.id===listing));passed++;
  const write=async(action,data,actor='sandrine')=>(await db.query('select sign_inventory_write($1,$2,$3) result',[action,data,actor])).rows[0].result;
  const stocks=async()=>Object.fromEntries((await db.query('select id,used,available from sign_inventory_availability()')).rows.map(x=>[x.id,x]));
  const row={id:randomUUID(),transaction_id:tx,listing_id:null,broker:'france',sign_type:'sale',has_bac:true,addons:[]};
  await write('assign',row);const before=await stocks();
  const matches=await search('Demonstration');assert.equal(matches[0].active_assignments[0].id,row.id);passed++;
  const edit={...row,version:1,addons:['addon:sold']};await write('edit',edit);
  const after=await stocks();assert.equal(after['sign:france'].used,before['sign:france'].used);assert.equal(after['addon:sold'].used,before['addon:sold'].used+1);passed+=2;
  const saved=(await db.query('select * from sign_assignments where transaction_id=$1',[tx])).rows;assert.equal(saved.length,1);assert.equal(saved[0].id,row.id);assert.equal(saved[0].updated_by,'sandrine');passed+=2;
  const event=(await db.query("select * from sign_inventory_events where assignment_id=$1 and action='edit'",[row.id])).rows[0];assert.equal(event.created_by,'sandrine');assert.deepEqual(event.after_data.addons,['addon:sold']);passed++;
  await db.exec('savepoint duplicate');await assert.rejects(()=>write('edit',{...edit,version:2,addons:['addon:sold','addon:sold']}),e=>e.code==='P0001');await db.exec('rollback to savepoint duplicate');passed++;
  await db.exec('savepoint stale');await assert.rejects(()=>write('edit',edit),e=>e.code==='P0001');await db.exec('rollback to savepoint stale');passed++;
  // Same serialization lock and version checks handle two requests for the last addon.
  const stock=(await db.query("select * from sign_inventory_stock where id='addon:sold'")).rows[0];
  await write('stock',{id:stock.id,version:stock.version,total:after['addon:sold'].used});
  const other={...row,id:randomUUID(),transaction_id:null,listing_id:listing};await write('assign',other);
  await db.exec('savepoint empty');await assert.rejects(()=>write('edit',{...other,version:1,addons:['addon:sold']}),e=>e.code==='P0001');await db.exec('rollback to savepoint empty');
  assert.equal((await db.query('select version from sign_assignments where id=$1',[other.id])).rows[0].version,1);passed++;
  await write('return',{id:row.id,version:2});assert.equal((await stocks())['addon:sold'].used,before['addon:sold'].used);passed++;
  assert.equal((await search('Demonstration'))[0].active_assignments.length,0);passed++;
  const ledger=(await db.query("select sign_inventory_assignments(false,'456 Exemple','','0') result")).rows[0].result;assert.equal(ledger.data[0].id,other.id);passed++;
  console.log(`PASS: ${passed} addon workflow scenarios: transaction/sold search, existing assignment, edit stock, audit, duplicates, stale version, exhaustion rollback, return.`);
 }finally{await db.exec('rollback');}
}
