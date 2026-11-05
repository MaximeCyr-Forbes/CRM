-- Native ACM storage and persistent Google Maps cost protection.
-- No anonymous sessions or public RPC access. Existing CRM tables are untouched.
create extension if not exists pgcrypto;

create table if not exists public.tool_acm_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'completed', 'archived')),
  subject_address text,
  subject_city text,
  property_category text check (
    property_category is null or property_category in (
      'single_family', 'condo', 'farm', 'commercial_industrial',
      'income_property', 'land', 'multi_category'
    )
  ),
  client_first_name text,
  client_last_name text,
  recommended_value numeric,
  comparable_count integer not null default 0 check (comparable_count >= 0),
  analysis_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tool_acm_analyses_owner_updated_idx
  on public.tool_acm_analyses (owner_id, updated_at desc);

create index if not exists tool_acm_analyses_owner_status_idx
  on public.tool_acm_analyses (owner_id, status);

create or replace function public.set_tool_acm_analysis_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists analyses_set_updated_at on public.tool_acm_analyses;
create trigger analyses_set_updated_at
before update on public.tool_acm_analyses
for each row execute function public.set_tool_acm_analysis_updated_at();

alter table public.tool_acm_analyses enable row level security;


revoke all on public.tool_acm_analyses from anon;
grant select, insert, update, delete on public.tool_acm_analyses to authenticated, service_role;
create policy crm_member_access on public.tool_acm_analyses for all to authenticated
using ((select crm_auth.has_functional_access()))
with check ((select crm_auth.has_functional_access()));

create table if not exists public.acm_google_maps_usage_daily (
  usage_day date primary key,
  google_geocoding_requests integer not null default 0 check (google_geocoding_requests >= 0),
  google_static_map_requests integer not null default 0 check (google_static_map_requests >= 0),
  google_maps_javascript_loads integer not null default 0 check (google_maps_javascript_loads >= 0),
  cache_hits integer not null default 0 check (cache_hits >= 0),
  cache_misses integer not null default 0 check (cache_misses >= 0),
  updated_at timestamptz not null default now()
);

alter table public.acm_google_maps_usage_daily
  add column if not exists google_maps_javascript_loads integer not null default 0 check (google_maps_javascript_loads >= 0);

create table if not exists public.acm_google_maps_usage_minute (
  service text not null,
  minute_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (service, minute_start)
);

alter table public.acm_google_maps_usage_minute drop constraint if exists google_maps_usage_minute_service_check;
alter table public.acm_google_maps_usage_minute
  add constraint google_maps_usage_minute_service_check check (service in ('geocoding', 'static_map', 'maps_javascript'));

create table if not exists public.acm_google_maps_circuit_breakers (
  service text primary key,
  consecutive_quota_failures integer not null default 0 check (consecutive_quota_failures >= 0),
  open_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.acm_google_maps_circuit_breakers drop constraint if exists google_maps_circuit_breakers_service_check;
alter table public.acm_google_maps_circuit_breakers
  add constraint google_maps_circuit_breakers_service_check check (service in ('geocoding', 'static_map', 'maps_javascript'));

create table if not exists public.acm_google_geocoding_cache (
  cache_key text primary key check (cache_key ~ '^[0-9a-f]{64}$'),
  source_address text not null,
  geo_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.acm_google_maps_usage_daily enable row level security;
alter table public.acm_google_maps_usage_minute enable row level security;
alter table public.acm_google_maps_circuit_breakers enable row level security;
alter table public.acm_google_geocoding_cache enable row level security;

revoke all on public.acm_google_maps_usage_daily from anon, authenticated;
revoke all on public.acm_google_maps_usage_minute from anon, authenticated;
revoke all on public.acm_google_maps_circuit_breakers from anon, authenticated;
revoke all on public.acm_google_geocoding_cache from anon, authenticated;

create or replace function public.acm_reserve_google_maps_request(
  p_service text,
  p_daily_limit integer,
  p_minute_limit integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'America/Toronto')::date;
  v_minute timestamptz := date_trunc('minute', now());
  v_daily_count integer := 0;
  v_minute_count integer := 0;
  v_open_until timestamptz;
begin
  if p_service not in ('geocoding', 'static_map', 'maps_javascript') or p_daily_limit < 1 or p_minute_limit < 1 then
    raise exception 'Invalid Google Maps usage limit';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('google-maps:' || p_service)::bigint);

  select open_until into v_open_until
  from public.acm_google_maps_circuit_breakers
  where service = p_service;

  if v_open_until is not null and v_open_until > now() then
    return pg_catalog.jsonb_build_object('allowed', false, 'reason', 'circuit_open');
  end if;

  insert into public.acm_google_maps_usage_daily (usage_day)
  values (v_day)
  on conflict (usage_day) do nothing;

  select case
    when p_service = 'geocoding' then google_geocoding_requests
    when p_service = 'static_map' then google_static_map_requests
    else google_maps_javascript_loads
  end into v_daily_count
  from public.acm_google_maps_usage_daily
  where usage_day = v_day
  for update;

  if v_daily_count >= p_daily_limit then
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit',
      'dailyCount', v_daily_count,
      'minuteCount', 0
    );
  end if;

  insert into public.acm_google_maps_usage_minute (service, minute_start)
  values (p_service, v_minute)
  on conflict (service, minute_start) do nothing;

  select request_count into v_minute_count
  from public.acm_google_maps_usage_minute
  where service = p_service and minute_start = v_minute
  for update;

  if v_minute_count >= p_minute_limit then
    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'reason', 'minute_limit',
      'dailyCount', v_daily_count,
      'minuteCount', v_minute_count
    );
  end if;

  update public.acm_google_maps_usage_daily
  set google_geocoding_requests = google_geocoding_requests + case when p_service = 'geocoding' then 1 else 0 end,
      google_static_map_requests = google_static_map_requests + case when p_service = 'static_map' then 1 else 0 end,
      google_maps_javascript_loads = google_maps_javascript_loads + case when p_service = 'maps_javascript' then 1 else 0 end,
      updated_at = now()
  where usage_day = v_day;

  update public.acm_google_maps_usage_minute
  set request_count = request_count + 1
  where service = p_service and minute_start = v_minute;

  delete from public.acm_google_maps_usage_minute where minute_start < now() - interval '2 days';

  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'reason', null,
    'dailyCount', v_daily_count + 1,
    'minuteCount', v_minute_count + 1
  );
end;
$$;

create or replace function public.acm_record_google_maps_cache_event(p_event text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'America/Toronto')::date;
begin
  if p_event not in ('hit', 'miss') then
    raise exception 'Invalid cache event';
  end if;

  insert into public.acm_google_maps_usage_daily (usage_day, cache_hits, cache_misses)
  values (v_day, case when p_event = 'hit' then 1 else 0 end, case when p_event = 'miss' then 1 else 0 end)
  on conflict (usage_day) do update
  set cache_hits = public.acm_google_maps_usage_daily.cache_hits + case when p_event = 'hit' then 1 else 0 end,
      cache_misses = public.acm_google_maps_usage_daily.cache_misses + case when p_event = 'miss' then 1 else 0 end,
      updated_at = now();
end;
$$;

create or replace function public.acm_record_google_maps_result(p_service text, p_quota_failure boolean)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_failures integer;
  v_open_until timestamptz;
begin
  if p_service not in ('geocoding', 'static_map', 'maps_javascript') then
    raise exception 'Invalid Google Maps service';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('google-maps-circuit:' || p_service)::bigint);

  insert into public.acm_google_maps_circuit_breakers (service)
  values (p_service)
  on conflict (service) do nothing;

  if p_quota_failure then
    update public.acm_google_maps_circuit_breakers
    set consecutive_quota_failures = consecutive_quota_failures + 1,
        open_until = case
          when consecutive_quota_failures + 1 >= 3 then now() + interval '5 minutes'
          else open_until
        end,
        updated_at = now()
    where service = p_service
    returning consecutive_quota_failures, open_until into v_failures, v_open_until;
  else
    update public.acm_google_maps_circuit_breakers
    set consecutive_quota_failures = 0,
        open_until = null,
        updated_at = now()
    where service = p_service
    returning consecutive_quota_failures, open_until into v_failures, v_open_until;
  end if;

  return pg_catalog.jsonb_build_object(
    'consecutiveQuotaFailures', v_failures,
    'openUntil', v_open_until
  );
end;
$$;

create or replace function public.acm_get_google_geocoding_cache(p_cache_key text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select geo_data
  from public.acm_google_geocoding_cache
  where cache_key = p_cache_key and p_cache_key ~ '^[0-9a-f]{64}$';
$$;

create or replace function public.acm_put_google_geocoding_cache(
  p_cache_key text,
  p_source_address text,
  p_geo_data jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_cache_key !~ '^[0-9a-f]{64}$'
    or length(p_source_address) < 3
    or length(p_source_address) > 500
    or p_geo_data->'geo'->>'provider' <> 'google'
    or jsonb_typeof(p_geo_data->'geo'->'latitude') <> 'number'
    or jsonb_typeof(p_geo_data->'geo'->'longitude') <> 'number'
    or length(coalesce(p_geo_data->'geo'->>'placeId', '')) < 1
    or length(coalesce(p_geo_data->'geo'->>'placeId', '')) > 500
    or length(coalesce(p_geo_data->'geo'->>'formattedAddress', '')) < 1
    or length(coalesce(p_geo_data->'geo'->>'formattedAddress', '')) > 500
  then
    raise exception 'Invalid geocoding cache entry';
  end if;

  insert into public.acm_google_geocoding_cache (cache_key, source_address, geo_data)
  values (p_cache_key, p_source_address, p_geo_data)
  on conflict (cache_key) do update
  set source_address = excluded.source_address,
      geo_data = excluded.geo_data,
      updated_at = now();
end;
$$;

create or replace function public.acm_get_google_maps_usage_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'usageDay', usage_day,
    'googleGeocodingRequests', google_geocoding_requests,
    'googleStaticMapRequests', google_static_map_requests,
    'googleMapsJavascriptLoads', google_maps_javascript_loads,
    'cacheHits', cache_hits,
    'cacheMisses', cache_misses
  )
  from public.acm_google_maps_usage_daily
  where usage_day = (now() at time zone 'America/Toronto')::date;
$$;

revoke all on function public.acm_reserve_google_maps_request(text, integer, integer) from public, anon, authenticated;
revoke all on function public.acm_record_google_maps_cache_event(text) from public, anon, authenticated;
revoke all on function public.acm_record_google_maps_result(text, boolean) from public, anon, authenticated;
revoke all on function public.acm_get_google_geocoding_cache(text) from public, anon, authenticated;
revoke all on function public.acm_put_google_geocoding_cache(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.acm_get_google_maps_usage_summary() from public, anon, authenticated;

grant execute on function public.acm_reserve_google_maps_request(text, integer, integer) to service_role;
grant execute on function public.acm_record_google_maps_cache_event(text) to service_role;
grant execute on function public.acm_record_google_maps_result(text, boolean) to service_role;
grant execute on function public.acm_get_google_geocoding_cache(text) to service_role;
grant execute on function public.acm_put_google_geocoding_cache(text, text, jsonb) to service_role;
grant execute on function public.acm_get_google_maps_usage_summary() to service_role;

grant all on public.acm_google_maps_usage_daily to service_role;

grant all on public.acm_google_maps_usage_minute to service_role;

grant all on public.acm_google_maps_circuit_breakers to service_role;

grant all on public.acm_google_geocoding_cache to service_role;
