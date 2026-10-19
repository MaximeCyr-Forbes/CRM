import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function testGoogleLoginV3(db) {
 let count=0;
 const check=(value,expected,label)=>{assert.deepEqual(value,expected,label);count++;};
 const scalar=async sql=>(await db.query(sql)).rows[0].value;
 const session=async(email,name='',verified=true)=>{
  await db.exec('reset role');
  const user=randomUUID(),id=randomUUID(),sid=randomUUID(),sub=randomUUID();
  await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[user,{full_name:'Maxime Cyr',email:'maxime@equipeforbesteam.com',email_verified:true}]);
  await db.query('insert into auth.identities(id,provider_id,user_id,provider,identity_data) values($1,$2,$3,$4,$5)',[id,sub,user,'google',{email,full_name:name,email_verified:verified,sub}]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,user]);
  const claims={sub:user,session_id:sid,role:'authenticated',exp:Date.now()/1000+3600,amr:[{method:'oauth'}]};
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims)]);
  await db.exec('set local role authenticated');
  return {user,id,sid,sub,claims};
 };
 await db.exec('begin; update public.crm_member_auth_identities set provider_subject=null,auth_user_id=null,active=true;');
 try {
  const aliases=(await db.query('select a.email_normalized,m.broker from public.crm_member_auth_identities a join public.crm_members m on m.id=a.member_id')).rows;
  for(const a of aliases){await session(' '+a.email_normalized.toUpperCase()+' ');check((await scalar('select public.crm_google_login_state() as value')).member?.broker,a.broker,'known alias');}
  for(const [email,name,broker] of [['alias-s@remax-quebec.com','Sandrine Charbonneau','sandrine'],['alias-f@equipeforbesteam.com','France Forbes','france']]){
   const s=await session(email,name);let state=await scalar('select public.crm_google_login_state() as value');
   check(state.member?.broker,broker,'unique profile');check(state.resolution,'profile','profile resolution');
   check((await scalar('select public.crm_google_login_state() as value')).resolution,'sub','second login subject');
   await db.exec('reset role');await db.query("update auth.identities set identity_data=identity_data||$1::jsonb where id=$2",[{email:'renamed-'+broker+'@remax-quebec.com'},s.id]);
   await db.exec('set local role authenticated');check((await scalar('select public.crm_authenticated_member() as value')).broker,broker,'changed corporate email');
   await db.exec('reset role');await db.query("update auth.identities set identity_data=identity_data||$1::jsonb where id=$2",[{email:'renamed@gmail.com'},s.id]);
   await db.exec('set local role authenticated');check(await scalar('select public.crm_authenticated_member() as value'),null,'changed external email denied');
  }
  for(const email of ['personal@gmail.com','a@hotmail.com','a@outlook.com','a@remax-quebec.com.evil.test','a@equipeforbesteam.com@evil.test']){
   await session(email,'Sandrine Charbonneau');check((await scalar('select public.crm_google_login_state() as value')).status,'domain_denied','external domain');
  }
  await session('new@remax-quebec.com','Sandrine Charbonneau',false);check((await scalar('select public.crm_google_login_state() as value')).status,'invalid','unverified');
  let unknown=await session('new@remax-quebec.com','Unknown');let state=await scalar('select public.crm_google_login_state() as value');
  check(state.status,'link_required','unknown corporate');check(await scalar('select public.crm_authenticated_member() as value'),null,'no access before link');
  check(await scalar('select count(*)::int as value from public.contacts'),0,'RLS denies unlinked Google');
  const sandrine=state.members.find(x=>x.name==='Sandrine Charbonneau').id;
  check(await scalar("select has_function_privilege('authenticated','public.crm_confirm_google_link(uuid,uuid,uuid,uuid)','execute') as value"),false,'confirmation not browser callable');
  await db.exec('reset role; set local role service_role');
  check((await db.query('select public.crm_confirm_google_link($1,$2,$3,$4) as value',[unknown.user,unknown.id,unknown.sid,sandrine])).rows[0].value,true,'confirmed link');
  for(let n=0;n<6;n++) check((await db.query('select public.crm_google_link_attempt($1) as value',[unknown.user])).rows[0].value,n<5,'bounded attempts');
  await db.exec('reset role; set local role authenticated');
  check((await scalar('select public.crm_google_login_state() as value')).member.broker,'sandrine','linked subsequent login');
  await db.exec('reset role');
  check(await scalar("select count(*)::int>1 as value from public.crm_member_auth_identities where member_id='"+sandrine+"' and provider_subject is not null"),true,'multiple identities per member');
  await db.exec('savepoint duplicate_subject');
  await assert.rejects(db.query('insert into public.crm_member_auth_identities(member_id,email_normalized,provider_subject,auth_user_id) values($1,$2,$3,$4)',[sandrine,'dup@remax-quebec.com',unknown.sub,unknown.user]),e=>e.code==='23505');count++;
  await db.exec('rollback to savepoint duplicate_subject');
  check(await scalar("select count(*)::int as value from crm_auth.identity_link_events where method='rescue_confirmation'"),1,'link audit');
  await db.exec("update public.crm_members set display_name='Ambiguous Name' where broker in ('france','maxime')");
  await session('ambiguous@remax-quebec.com','Ambiguous Name');check((await scalar('select public.crm_google_login_state() as value')).status,'link_required','ambiguous profile');
  await session('forged@remax-quebec.com','Unknown');check((await scalar('select public.crm_google_login_state() as value')).status,'link_required','editable user metadata ignored');
  await db.exec('reset role');await db.query('update public.crm_member_auth_identities set active=false where provider_subject=$1',[unknown.sub]);
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(unknown.claims)]);await db.exec('set local role authenticated');
  check((await scalar('select public.crm_google_login_state() as value')).status,'blocked','disabled identity cannot relink');
  console.log(`PASS: ${count} Google login v3 PostgreSQL scenarios`);
 } finally {await db.exec('rollback');}
}
