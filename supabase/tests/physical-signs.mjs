import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function testPhysicalSigns(db){
 await db.exec('begin');
 let passed=0;
 try{
  await db.exec(`update public.sign_inventory_stock set total=100;
   insert into public.sign_inventory_types(id,label) values('sale','Synthetic sale') on conflict do nothing;
   insert into public.sign_inventory_stock(id,kind,label,total) values
   ('addon:estimate','addon','Synthetic estimate',100),('addon:rent','addon','Synthetic rent',100),
   ('addon:open-house','addon','Synthetic open house',100),('addon:sold','addon','Synthetic sold',100)
   on conflict(id) do update set total=100;`);
  const listing=randomUUID();
  await db.query("insert into public.listings(id,address,broker) values($1,'Synthetic physical sign','france')",[listing]);
  const usage=async()=>Number((await db.query("select used from public.sign_inventory_availability() where id='sign:france'")).rows[0].used);
  const write=async(action,data)=>db.query('select public.sign_inventory_write($1,$2,$3)',[action,data,'maxime']);
  const base=()=>({id:randomUUID(),listing_id:listing,broker:'france',sign_type:null,has_bac:false,addons:[]});
  const scenarios=[
   ['sign only','sale',[],false,1],
   ...['estimate','sold','open-house','rent'].map(x=>[x+' only',null,['addon:'+x],false,1]),
   ['sign + addon','sale',['addon:estimate'],false,1],
   ['sign + multiple','sale',['addon:estimate','addon:open-house','addon:sold'],false,1],
   ['multiple addons',null,['addon:estimate','addon:sold'],false,1],
   ['BAC only',null,[],true,0],
   ['BAC + addon',null,['addon:estimate'],true,1],
   ['BAC + sign','sale',[],true,1],
   ['returned addon',null,['addon:estimate'],false,0],
  ];
  for(const [name,sign_type,addons,has_bac,expected] of scenarios){
   const before=await usage(),data={...base(),sign_type,addons,has_bac};
   await write('assign',data);
   if(name==='returned addon')await write('return',{id:data.id,version:1});
   assert.equal(await usage(),before+expected,name);
   if(name!=='returned addon')await write('return',{id:data.id,version:1});
   assert.equal(await usage(),before,name+' return restores stock');
   passed++;
  }
  const data={...base(),has_bac:true},before=await usage();
  await write('assign',data);
  await write('edit',{...data,version:1,addons:['addon:estimate']});
  assert.equal(await usage(),before+1,'BAC becomes physical sign');
  await write('edit',{...data,version:2});
  assert.equal(await usage(),before,'removing last addon restores sign');
  passed+=2;
  // Two physical assignments on one property remain two signs.
  const a={...base(),addons:['addon:estimate']},b={...base(),addons:['addon:sold','addon:rent']};
  await write('assign',a);await write('assign',b);
  assert.equal(await usage(),before+2);passed++;
  const stock=(await db.query("select * from public.sign_inventory_stock where id='sign:france'")).rows[0];
  await write('stock',{id:stock.id,total:await usage(),version:stock.version});
  await db.exec('savepoint exhausted');
  await assert.rejects(()=>write('assign',{...base(),addons:['addon:estimate']}),e=>e.code==='P0001');
  await db.exec('rollback to savepoint exhausted');passed++;
  await db.exec('savepoint too_low');
  await assert.rejects(()=>write('stock',{id:stock.id,total:0,version:stock.version+1}),e=>e.code==='P0001');
  await db.exec('rollback to savepoint too_low');passed++;
  assert.equal((await db.query("select available from public.sign_inventory_availability() where id='sign:france'")).rows[0].available,0);
  console.log(`PASS: ${passed} physical sign scenarios, including all 12 matrix cases, edits, returns and stock exhaustion.`);
 }finally{await db.exec('rollback');}
}
