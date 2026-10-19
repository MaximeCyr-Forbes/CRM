-- Additive identity layer. Existing broker keys and every business row remain unchanged.
create schema if not exists crm_auth;
revoke all on schema crm_auth from public, anon, authenticated;
grant usage on schema crm_auth to authenticated, service_role;
create table public.crm_members (
 id uuid primary key default gen_random_uuid(),
 broker public.broker_assignment not null unique check(broker::text in ('maxime','france','sandrine')),
 role text not null check(role in ('admin','broker')),
 active boolean not null default true,
 allowed_brokers text[] not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(allowed_brokers <@ array['maxime','france','sandrine']::text[]),
 check(broker::text = any(allowed_brokers))
);
create table public.crm_member_auth_identities (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.crm_members(id),
 provider text not null default 'google' check(provider='google'),
 email_normalized text not null check(email_normalized=lower(btrim(email_normalized))),
 provider_subject text,
 auth_user_id uuid references auth.users(id),
 active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(provider,email_normalized), unique(provider,provider_subject),
 check ((provider_subject is null) = (auth_user_id is null))
);
create index crm_member_auth_identities_member on public.crm_member_auth_identities(member_id);
create index crm_member_auth_identities_user on public.crm_member_auth_identities(auth_user_id);
alter table public.crm_members enable row level security;
alter table public.crm_member_auth_identities enable row level security;
revoke all on public.crm_members, public.crm_member_auth_identities from public,anon,authenticated;
grant all on public.crm_members, public.crm_member_auth_identities to service_role;

-- No pre-existing member table exists: these rows attach to the existing unique broker keys.
insert into public.crm_members(broker,role,allowed_brokers) values
 ('maxime','admin',array['maxime','france','sandrine']),
 ('france','broker',array['france']),('sandrine','broker',array['sandrine']);
insert into public.crm_member_auth_identities(member_id,email_normalized)
 select m.id,v.email from (values
 ('maxime','maxime@equipeforbesteam.com'),('maxime','maxime.cyr@remax-quebec.com'),
 ('france','france@equipeforbesteam.com'),('france','france.forbes@remax-quebec.com'),
 ('sandrine','sandrine@equipeforbesteam.com'),('sandrine','sandrine.charbonneau@remax-quebec.com')
 ) v(broker,email) join public.crm_members m on m.broker::text=v.broker;

-- Provider-owned auth.identities is authoritative, NOT editable raw_user_meta_data.
-- Fail closed if an auth user has multiple Google identities rather than choosing an alias.
create function crm_auth.verified_google_identity()
returns setof auth.identities language sql stable security definer set search_path='' as $$
 select i.* from auth.identities i
 join auth.sessions s on s.user_id=i.user_id and s.id::text=auth.jwt()->>'session_id'
 where auth.uid() is not null and i.user_id=auth.uid() and i.provider='google'
 and i.identity_data->>'email_verified'='true'
 and nullif(i.provider_id,'') is not null
 and (s.not_after is null or s.not_after>now())
 and (auth.jwt()->>'exp')::numeric > extract(epoch from now())
 and exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a where a->>'method'='oauth')
 and (select count(*) from auth.identities other where other.user_id=i.user_id and other.provider='google')=1;
$$;
revoke all on function crm_auth.verified_google_identity() from public,anon,authenticated;

create function crm_auth.member_identity()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('member_id',m.id,'identity_id',a.id,'auth_user_id',i.user_id,
 'broker',m.broker,'role',m.role,'brokers',m.allowed_brokers)
 from crm_auth.verified_google_identity() i
 join public.crm_member_auth_identities a on a.provider=i.provider and a.provider_subject=i.provider_id
   and a.auth_user_id=i.user_id and a.email_normalized=lower(btrim(i.identity_data->>'email'))
 join public.crm_members m on m.id=a.member_id
 where a.active and m.active;
$$;
revoke all on function crm_auth.member_identity() from public,anon;
grant execute on function crm_auth.member_identity() to authenticated,service_role;

-- Called only after the official PKCE exchange. Atomic first binding; never accepts email/subject arguments.
create function public.crm_bind_google_identity()
returns jsonb language plpgsql security definer set search_path='' as $$
declare i auth.identities; begin
 select * into i from crm_auth.verified_google_identity();
 if i.id is null then return null; end if;
 update public.crm_member_auth_identities a
 set provider_subject=i.provider_id, auth_user_id=i.user_id, updated_at=now()
 where a.provider='google' and a.email_normalized=lower(btrim(i.identity_data->>'email'))
 and a.active and a.provider_subject is null and a.auth_user_id is null
 and exists(select 1 from public.crm_members m where m.id=a.member_id and m.active);
 return crm_auth.member_identity();
end; $$;
revoke all on function public.crm_bind_google_identity() from public,anon;
grant execute on function public.crm_bind_google_identity() to authenticated;

create function public.crm_authenticated_member()
returns jsonb language sql stable security invoker set search_path='' as $$
 select crm_auth.member_identity();
$$;
revoke all on function public.crm_authenticated_member() from public,anon;
grant execute on function public.crm_authenticated_member() to authenticated;

create function crm_auth.can_access(target text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((crm_auth.member_identity()->'brokers') ? target, false);
$$;
revoke all on function crm_auth.can_access(text) from public,anon;
grant execute on function crm_auth.can_access(text) to authenticated;
