-- Synthetic Auth records only; every write is rolled back. No emails or OAuth calls.
begin;
do $$
declare a record; u uuid; s uuid; resolved jsonb; expected uuid; first_id uuid; n integer:=0; begin
 for a in select i.*,m.broker from public.crm_member_auth_identities i join public.crm_members m on m.id=i.member_id order by m.broker,i.email_normalized loop
  u:=gen_random_uuid(); s:=gen_random_uuid();
  insert into auth.users(id) values(u);
  insert into auth.identities(provider_id,user_id,identity_data,provider) values('qa-'||u,u,jsonb_build_object('email',upper(a.email_normalized),'email_verified',true,'sub','qa-'||u),'google');
  insert into auth.sessions(id,user_id) values(s,u);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',s,'exp',extract(epoch from now()+interval '1 hour'),'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
  set local role authenticated;
  resolved:=public.crm_bind_google_identity();
  if resolved->>'member_id' is distinct from a.member_id::text or resolved->>'broker' is distinct from a.broker::text then raise exception 'alias mapping failed'; end if;
  if public.crm_authenticated_member() is distinct from resolved then raise exception 'persistent identity resolution failed'; end if;
  reset role;
  update public.crm_member_auth_identities set active=false where id=a.id;
  set local role authenticated;
  if public.crm_authenticated_member() is not null then raise exception 'disabled identity accepted'; end if;
  reset role;
  update public.crm_member_auth_identities set active=true where id=a.id;
  update public.crm_members set active=false where id=a.member_id;
  set local role authenticated;
  if public.crm_authenticated_member() is not null then raise exception 'disabled member accepted'; end if;
  reset role;
  update public.crm_members set active=true where id=a.member_id;
  update auth.identities set identity_data=identity_data||'{"email_verified":false}'::jsonb where user_id=u;
  set local role authenticated;
  if public.crm_authenticated_member() is not null then raise exception 'unverified identity accepted'; end if;
  reset role;
  update auth.identities set identity_data=identity_data||'{"email_verified":true}'::jsonb where user_id=u;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',s,'exp',extract(epoch from now()+interval '1 hour'),'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
  set local role authenticated;
  if public.crm_authenticated_member() is not null then raise exception 'password session accepted'; end if;
  reset role;
  n:=n+1;
 end loop;
 if n<>6 or (select count(*) from public.crm_members)<>3 then raise exception 'unexpected member or alias count'; end if;
 for a in select unnest(array['inconnu@equipeforbesteam.com','inconnu@remax-quebec.com','example@gmail.com']) email loop
  u:=gen_random_uuid(); s:=gen_random_uuid();
  insert into auth.users(id,raw_user_meta_data) values(u,'{"email":"maxime@equipeforbesteam.com","role":"admin","email_verified":true}'::jsonb);
  insert into auth.identities(provider_id,user_id,identity_data,provider) values('qa-'||u,u,jsonb_build_object('email',a.email,'email_verified',true),'google');
  insert into auth.sessions(id,user_id) values(s,u);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',s,'exp',extract(epoch from now()+interval '1 hour'),'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
  set local role authenticated;
  if public.crm_bind_google_identity() is not null then raise exception 'unknown account admitted'; end if;
  reset role;
 end loop;
end; $$;
rollback;
select 'PASS: six aliases, three members, disabled identities/members, unverified email, password session and three unknown accounts; all writes rolled back' as result;
