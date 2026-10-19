-- Google login v3: trusted provider identity -> existing member. No rescue-login changes.
create table crm_auth.allowed_google_domains(domain text primary key check(domain=lower(btrim(domain))));
insert into crm_auth.allowed_google_domains values ('equipeforbesteam.com'),('remax-quebec.com');
alter table crm_auth.allowed_google_domains enable row level security;
revoke all on crm_auth.allowed_google_domains from public,anon,authenticated;
grant all on crm_auth.allowed_google_domains to service_role;
alter table public.crm_members add column display_name text;
update public.crm_members set display_name=case broker::text when 'maxime' then 'Maxime Cyr' when 'sandrine' then 'Sandrine Charbonneau' when 'france' then 'France Forbes' end;

create table crm_auth.identity_link_events (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.crm_members(id),
 identity_id uuid not null references public.crm_member_auth_identities(id), auth_user_id uuid not null references auth.users(id),
 method text not null check(method in ('exact_email','profile_match','rescue_confirmation')),
 created_at timestamptz not null default now()
);
create index identity_link_events_member on crm_auth.identity_link_events(member_id);
create index identity_link_events_identity on crm_auth.identity_link_events(identity_id);
create index identity_link_events_user on crm_auth.identity_link_events(auth_user_id);
alter table crm_auth.identity_link_events enable row level security;
revoke all on crm_auth.identity_link_events from public,anon,authenticated;

create function crm_auth.google_domain_allowed(email text) returns boolean
language sql stable security definer set search_path='' as $$
 select email is not null and lower(btrim(email)) ~ '^[^@[:space:]]+@[^@[:space:]]+$'
 and exists(select 1 from crm_auth.allowed_google_domains d where d.domain=split_part(lower(btrim(email)),'@',2));
$$;
revoke all on function crm_auth.google_domain_allowed(text) from public,anon,authenticated;

-- Preserve Google verification, live sessions, AMR and delegated-consent validation.
-- A provider subject is stable; a corporate email may change after binding.
create or replace function crm_auth.verified_google_identity()
returns setof auth.identities language sql stable security definer set search_path='' as $$
 select i.* from auth.identities i
 join auth.sessions s on s.user_id=i.user_id and s.id::text=auth.jwt()->>'session_id'
 where auth.uid() is not null and i.user_id=auth.uid() and i.provider='google'
 and i.identity_data->>'email_verified'='true' and nullif(i.provider_id,'') is not null
 and (s.not_after is null or s.not_after>now())
 and (auth.jwt()->>'exp')::numeric > extract(epoch from now())
 and (select count(*) from auth.identities other where other.user_id=i.user_id and other.provider='google')=1
 and (
  (s.oauth_client_id is null and nullif(auth.jwt()->>'client_id','') is null
   and exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a where a->>'method'='oauth'))
  or (s.oauth_client_id::text=auth.jwt()->>'client_id'
   and exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a where a->>'method'='oauth_provider/authorization_code')
   and exists(select 1 from auth.oauth_consents c join auth.oauth_clients oc on oc.id=c.client_id
     where c.user_id=i.user_id and c.client_id=s.oauth_client_id and c.revoked_at is null and oc.deleted_at is null)
   and exists(select 1 from public.crm_member_auth_identities a join public.crm_members m on m.id=a.member_id
     where a.auth_user_id=i.user_id and a.provider=i.provider and a.provider_subject=i.provider_id and a.active and m.active))
 );
$$;
create or replace function crm_auth.member_identity()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('member_id',m.id,'identity_id',a.id,'auth_user_id',i.user_id,
 'broker',m.broker,'role',m.role,'brokers',jsonb_build_array('france','maxime','sandrine'))
 from crm_auth.verified_google_identity() i
 join public.crm_member_auth_identities a on a.provider=i.provider and a.provider_subject=i.provider_id and a.auth_user_id=i.user_id
 join public.crm_members m on m.id=a.member_id
 where a.active and m.active and crm_auth.google_domain_allowed(i.identity_data->>'email');
$$;

-- Private writer, reachable only through the verified resolver or service confirmation.
create function crm_auth.link_google_identity(i auth.identities, target uuid, method text) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.crm_member_auth_identities; v_email text:=lower(btrim(i.identity_data->>'email')); begin
 perform pg_advisory_xact_lock(714204,1);
 if i.provider<>'google' or i.identity_data->>'email_verified' is distinct from 'true'
  or not crm_auth.google_domain_allowed(v_email) or nullif(i.provider_id,'') is null
  or not exists(select 1 from public.crm_members where id=target and active) then return false; end if;
 select * into a from public.crm_member_auth_identities where provider='google' and provider_subject=i.provider_id;
 if found then return a.active and a.member_id=target and a.auth_user_id=i.user_id; end if;
 select * into a from public.crm_member_auth_identities where provider='google' and email_normalized=v_email for update;
 if found then
  if not a.active or a.member_id<>target or a.provider_subject is not null then return false; end if;
  update public.crm_member_auth_identities set provider_subject=i.provider_id,auth_user_id=i.user_id,updated_at=now() where id=a.id;
 else
  insert into public.crm_member_auth_identities(member_id,email_normalized,provider_subject,auth_user_id)
  values(target,v_email,i.provider_id,i.user_id) returning * into a;
 end if;
 insert into crm_auth.identity_link_events(member_id,identity_id,auth_user_id,method) values(target,a.id,i.user_id,method);
 return true;
end; $$;
revoke all on function crm_auth.link_google_identity(auth.identities,uuid,text) from public,anon,authenticated;

create or replace function crm_auth.crm_bind_google_identity() returns jsonb
language plpgsql security definer set search_path='' as $$
declare i auth.identities; a public.crm_member_auth_identities; target uuid; candidates integer; profile text; begin
 select * into i from crm_auth.verified_google_identity();
 if i.id is null or not crm_auth.google_domain_allowed(i.identity_data->>'email') then return null; end if;
 if exists(select 1 from public.crm_member_auth_identities where provider='google' and provider_subject=i.provider_id) then
  return crm_auth.member_identity(); -- disabled/conflicting subjects cannot rebind
 end if;
 -- A delegated MCP session cannot establish a new identity.
 if nullif(auth.jwt()->>'client_id','') is not null then return null; end if;
 select * into a from public.crm_member_auth_identities where provider='google' and email_normalized=lower(btrim(i.identity_data->>'email'));
 if found then
  if crm_auth.link_google_identity(i,a.member_id,'exact_email') then return crm_auth.member_identity(); end if;
  return null;
 end if;
 -- Provider-owned Google profile only. Never use auth.users/raw_user_meta_data or browser input.
 profile:=lower(regexp_replace(btrim(coalesce(i.identity_data->>'full_name',i.identity_data->>'name','')),'\s+',' ','g'));
 select count(*), (array_agg(id))[1] into candidates,target from public.crm_members
 where lower(regexp_replace(btrim(display_name),'\s+',' ','g'))=profile and profile<>'';
 if candidates=1 and crm_auth.link_google_identity(i,target,'profile_match') then return crm_auth.member_identity(); end if;
 return null;
end; $$;

create function crm_auth.google_login_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare i auth.identities; m jsonb; resolution text; begin
 select * into i from crm_auth.verified_google_identity();
 if i.id is null or nullif(auth.jwt()->>'client_id','') is not null then return jsonb_build_object('status','invalid'); end if;
 if not crm_auth.google_domain_allowed(i.identity_data->>'email') then return jsonb_build_object('status','domain_denied'); end if;
 resolution:=case when exists(select 1 from public.crm_member_auth_identities where provider='google' and provider_subject=i.provider_id) then 'sub'
 when exists(select 1 from public.crm_member_auth_identities where provider='google' and email_normalized=lower(btrim(i.identity_data->>'email'))) then 'exact' else 'profile' end;
 m:=crm_auth.crm_bind_google_identity();
 if m is not null then return jsonb_build_object('status','ready','member',m,'resolution',resolution); end if;
 if exists(select 1 from public.crm_member_auth_identities where provider='google' and
  (provider_subject=i.provider_id or email_normalized=lower(btrim(i.identity_data->>'email')))) then
  return jsonb_build_object('status','blocked');
 end if;
 return jsonb_build_object('status','link_required','auth_user_id',i.user_id,'google_identity_id',i.id,
 'session_id',auth.jwt()->>'session_id','members',(select jsonb_agg(jsonb_build_object('id',id,'name',display_name) order by display_name) from public.crm_members where active));
end; $$;
revoke all on function crm_auth.google_login_state() from public,anon;
grant execute on function crm_auth.google_login_state() to authenticated;
create function public.crm_google_login_state() returns jsonb language sql security invoker set search_path='' as $$ select crm_auth.google_login_state(); $$;
revoke all on function public.crm_google_login_state() from public,anon;
grant execute on function public.crm_google_login_state() to authenticated;

-- Only the server may confirm after reusing verifyCRMPassword; no browser boolean/password reaches SQL.
create function public.crm_confirm_google_link(p_user uuid,p_identity uuid,p_session uuid,p_member uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare i auth.identities; begin
 select g.* into i from auth.identities g join auth.sessions s on s.user_id=g.user_id
 where g.id=p_identity and g.user_id=p_user and g.provider='google' and s.id=p_session and s.oauth_client_id is null
 and (s.not_after is null or s.not_after>now());
 if i.id is null then return false; end if;
 return crm_auth.link_google_identity(i,p_member,'rescue_confirmation');
end; $$;
revoke all on function public.crm_confirm_google_link(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_confirm_google_link(uuid,uuid,uuid,uuid) to service_role;

-- Separate bounded confirmation attempts; the rescue login itself is unchanged.
create table crm_auth.link_attempts(user_id uuid primary key references auth.users(id), window_start timestamptz not null, attempts integer not null);
alter table crm_auth.link_attempts enable row level security;
revoke all on crm_auth.link_attempts from public,anon,authenticated;
create function public.crm_google_link_attempt(p_user uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; begin
 insert into crm_auth.link_attempts values(p_user,now(),1)
 on conflict(user_id) do update set attempts=case when crm_auth.link_attempts.window_start<now()-interval '15 minutes' then 1 else crm_auth.link_attempts.attempts+1 end,
 window_start=case when crm_auth.link_attempts.window_start<now()-interval '15 minutes' then now() else crm_auth.link_attempts.window_start end
 returning attempts into n;
 return n<=5;
end; $$;
revoke all on function public.crm_google_link_attempt(uuid) from public,anon,authenticated;
grant execute on function public.crm_google_link_attempt(uuid) to service_role;
