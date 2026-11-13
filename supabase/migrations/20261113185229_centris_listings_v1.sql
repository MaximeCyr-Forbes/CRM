-- Additive Centris integration. No existing operational data is backfilled.
alter table public.listings
 add column centris_listing_key text,
 add column centris_standard_status text,
 add column centris_mls_status text,
 add column centris_modification_timestamp timestamptz,
 add column centris_last_synced_at timestamptz,
 add column centris_list_agent_key text,
 add column centris_co_list_agent_key text,
 add column centris_media_key text;
create unique index listings_centris_key_unique on public.listings(centris_listing_key) where centris_listing_key is not null;

create table public.centris_member_mappings (
 broker public.broker_assignment primary key check(broker::text in ('maxime','sandrine','france')),
 member_key text not null unique, member_mls_id text not null,
 member_email text not null, verified_at timestamptz not null default now()
);
create table public.centris_sync_runs (
 id uuid primary key, actor uuid not null, started_at timestamptz not null default now(),
 completed_at timestamptz, status text not null check(status in ('running','success','partial','failed')),
 result jsonb, error_summary text
);
create table public.centris_sync_state (
 id boolean primary key default true check(id), run_id uuid, lock_until timestamptz,
 last_started_at timestamptz, last_completed_at timestamptz, last_success_at timestamptz,
 status text not null default 'idle', last_error text, result jsonb
);
insert into public.centris_sync_state(id) values(true);
alter table public.centris_member_mappings enable row level security;
alter table public.centris_sync_runs enable row level security;
alter table public.centris_sync_state enable row level security;
revoke all on public.centris_member_mappings,public.centris_sync_runs,public.centris_sync_state from public,anon,authenticated;
grant all on public.centris_member_mappings,public.centris_sync_runs,public.centris_sync_state to service_role;

create function public.centris_start_sync(p_run uuid,p_actor uuid) returns boolean
language plpgsql set search_path='' as $$
begin
 update public.centris_sync_state set run_id=p_run,lock_until=now()+interval '10 minutes',
 last_started_at=now(),status='running',last_error=null where id and (lock_until is null or lock_until<now());
 if not found then return false; end if;
 update public.centris_sync_runs set status='failed',completed_at=now(),error_summary='Synchronisation interrompue.' where status='running';
 insert into public.centris_sync_runs(id,actor,status) values(p_run,p_actor,'running');
 return true;
end $$;
create function public.centris_finish_sync(p_run uuid,p_status text,p_result jsonb,p_error text default null) returns void
language plpgsql set search_path='' as $$
begin
 if p_status not in ('success','partial','failed') then raise exception 'Invalid result'; end if;
 update public.centris_sync_state set lock_until=null,last_completed_at=now(),status=p_status,
 last_success_at=case when p_status='success' then now() else last_success_at end,result=p_result,last_error=p_error
 where id and run_id=p_run;
 update public.centris_sync_runs set completed_at=now(),status=p_status,result=p_result,error_summary=p_error where id=p_run;
end $$;

-- Atomic per-property plan/apply; whitelist prevents source data from changing CRM-owned fields.
-- Uses the existing Listing RPCs so price history and the initial checklist remain consistent.
create function public.centris_apply_property(p_values jsonb,p_source jsonb,p_eligible boolean,p_actor text,
 p_dry_run boolean default true,p_run uuid default null) returns jsonb
language plpgsql set search_path='' as $$
declare
 v_row public.listings; v_key_id uuid; v_number_id uuid; v_allowed jsonb; v_diff jsonb;
 v_current jsonb; v_action text; v_meta_changed boolean;
begin
 if nullif(p_source->>'key','') is null or nullif(p_values->>'centrisNumber','') is null then raise exception 'Invalid source'; end if;
 if not p_dry_run then
   perform 1 from public.centris_sync_state where id and run_id=p_run and lock_until>now() for update;
   if not found then raise exception 'Sync lease expired'; end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('centris-listings',0));
 select id into v_key_id from public.listings where centris_listing_key=p_source->>'key';
 select id into v_number_id from public.listings where centris_number=p_values->>'centrisNumber';
 if v_key_id is not null and v_number_id is not null and v_key_id<>v_number_id then
   return jsonb_build_object('action','conflict','reason','Identité Centris en conflit.');
 end if;
 select * into v_row from public.listings where id=coalesce(v_key_id,v_number_id) for update;
 if found and v_row.centris_listing_key is not null and v_row.centris_listing_key<>p_source->>'key' then
   return jsonb_build_object('action','conflict','reason','Numéro Centris déjà associé à une autre ressource.');
 end if;
 if v_row.id is not null and v_row.status in ('sold','rented') then
   return jsonb_build_object('action','skipped','reason','Historique finalisé conservé.');
 end if;
 if v_row.id is null and not p_eligible then return jsonb_build_object('action','skipped','reason','Hors inventaire actif.'); end if;
 if v_row.centris_modification_timestamp > (p_source->>'modified')::timestamptz then
   return jsonb_build_object('action','unchanged','reason','Source antérieure conservée.');
 end if;
 select coalesce(jsonb_object_agg(key,value),'{}') into v_allowed from jsonb_each(p_values)
 where key=any(array['civicNumber','address','apartment','city','province','postalCode','country','centrisNumber',
 'broker','purpose','askingPrice','monthlyRent','propertyType','listingDate','centrisUrl','primaryImageUrl']);
 if v_row.id is null then
   v_action:='created';
   if not p_dry_run then
     select * into v_row from public.create_listing_with_owners(v_allowed||jsonb_build_object('status','active','actorBroker',p_actor),array[]::uuid[]);
   end if;
 else
   v_current:=jsonb_build_object('civicNumber',v_row.civic_number,'address',v_row.address,'apartment',v_row.apartment,
    'city',v_row.city,'province',v_row.province,'postalCode',v_row.postal_code,'country',v_row.country,
    'centrisNumber',v_row.centris_number,'broker',v_row.broker,'purpose',v_row.purpose,'askingPrice',v_row.asking_price,
    'monthlyRent',v_row.monthly_rent,'propertyType',v_row.property_type,'listingDate',v_row.listing_date,
    'centrisUrl',v_row.centris_url,'primaryImageUrl',v_row.primary_image_url);
   select coalesce(jsonb_object_agg(key,value),'{}') into v_diff from jsonb_each(v_allowed) where value is distinct from v_current->key;
   v_meta_changed:=v_row.centris_listing_key is distinct from p_source->>'key'
    or v_row.centris_standard_status is distinct from p_source->>'standard'
    or v_row.centris_mls_status is distinct from p_source->>'mls'
    or v_row.centris_modification_timestamp is distinct from (p_source->>'modified')::timestamptz
    or v_row.centris_list_agent_key is distinct from p_source->>'agent'
    or v_row.centris_co_list_agent_key is distinct from p_source->>'coAgent'
    or v_row.centris_media_key is distinct from p_source->>'mediaKey';
   if v_diff='{}' and not v_meta_changed then return jsonb_build_object('action','unchanged','id',v_row.id); end if;
   v_action:='updated';
   if not p_dry_run and v_diff<>'{}' then
     select * into v_row from public.update_listing_with_owners(v_row.id,v_diff||jsonb_build_object('actorBroker',p_actor),null);
   end if;
 end if;
 if not p_dry_run then
   update public.listings set centris_listing_key=p_source->>'key',centris_standard_status=p_source->>'standard',
    centris_mls_status=p_source->>'mls',centris_modification_timestamp=(p_source->>'modified')::timestamptz,
    centris_last_synced_at=now(),centris_list_agent_key=p_source->>'agent',centris_co_list_agent_key=p_source->>'coAgent',
    centris_media_key=p_source->>'mediaKey' where id=v_row.id;
 end if;
 return jsonb_build_object('action',v_action,'id',v_row.id);
exception when unique_violation then return jsonb_build_object('action','conflict','reason','Identité Centris en conflit.');
end $$;
revoke all on function public.centris_start_sync(uuid,uuid),public.centris_finish_sync(uuid,text,jsonb,text),
 public.centris_apply_property(jsonb,jsonb,boolean,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.centris_start_sync(uuid,uuid),public.centris_finish_sync(uuid,text,jsonb,text),
 public.centris_apply_property(jsonb,jsonb,boolean,text,boolean,uuid) to service_role;
