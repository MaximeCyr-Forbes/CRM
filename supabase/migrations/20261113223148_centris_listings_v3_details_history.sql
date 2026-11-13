-- Centris owns only this complementary record and its explicitly attributed history.
create table public.centris_property_details (
 listing_id uuid primary key references public.listings(id) on delete cascade,
 bedrooms_total integer check(bedrooms_total>=0), above_ground_bedrooms integer check(above_ground_bedrooms>=0),
 basement_bedrooms integer check(basement_bedrooms>=0), bathrooms_full integer check(bathrooms_full>=0),
 bathrooms_partial integer check(bathrooms_partial>=0), living_area numeric check(living_area>=0), living_area_units text,
 lot_area numeric check(lot_area>=0), lot_area_units text, year_built integer check(year_built>=0),
 garage boolean, garage_spaces numeric check(garage_spaces>=0), parking_total numeric check(parking_total>=0),
 property_type text, property_subtype text, public_remarks text,
 price_changed_at timestamptz, status_changed_at timestamptz,
 source_price numeric, source_purpose text, revision bigint not null default 0,
 last_change_at timestamptz, last_change_kind text, updated_at timestamptz not null default now()
);
alter table public.centris_property_details enable row level security;
revoke all on public.centris_property_details from public,anon,authenticated;
grant select,insert,update on public.centris_property_details to service_role;
grant select on public.centris_property_details to authenticated;
create policy centris_details_visible_listing on public.centris_property_details for select to authenticated
 using (exists(select 1 from public.listings l where l.id=listing_id));

alter table public.listing_activity add column source text not null default 'crm' check(source in('crm','centris')),
 add column source_at timestamptz, add column source_event_key text;
alter table public.listing_price_history add column source text not null default 'crm' check(source in('crm','centris')),
 add column source_at timestamptz, add column source_event_key text;
create unique index listing_activity_centris_event_unique on public.listing_activity(source_event_key) where source_event_key is not null;
create unique index listing_price_centris_event_unique on public.listing_price_history(source_event_key) where source_event_key is not null;

-- Existing CRM RPCs still handle normal history. Inside the Centris transaction,
-- suppress only their price entries: the source transition is recorded once below.
create function public.centris_history_origin() returns trigger language plpgsql security invoker set search_path='' as $$
declare context jsonb;
begin
 context:=nullif(current_setting('crm.centris_context',true),'')::jsonb;
 if context is null then return new; end if;
 if tg_table_name='listing_price_history' then
   if (context->>'existing')::boolean then return null; end if;
   new.changed_by:=null;
 else
   if new.event_type in('price_changed','rent_changed') then return null; end if;
   new.actor_broker:=null;
 end if;
 new.source:='centris';
 return new;
end $$;
revoke all on function public.centris_history_origin() from public,anon,authenticated;
grant execute on function public.centris_history_origin() to service_role;
create trigger centris_activity_origin before insert on public.listing_activity for each row execute function public.centris_history_origin();
create trigger centris_price_origin before insert on public.listing_price_history for each row execute function public.centris_history_origin();

-- No secrets or commands are returned to the application.
create function public.centris_schedule_status() returns boolean language sql security definer set search_path='' as $$
 select count(*)=1 and coalesce(bool_and(active and schedule='17 11,23 * * *'),false)
 from cron.job where jobname='centris-listings-sync-12h';
$$;
revoke all on function public.centris_schedule_status() from public,anon,authenticated;
grant execute on function public.centris_schedule_status() to service_role;

create or replace function public.centris_apply_property(p_values jsonb,p_source jsonb,p_eligible boolean,p_actor text,
 p_dry_run boolean default true,p_run uuid default null) returns jsonb
language plpgsql set search_path='' as $$
declare
 v_row public.listings; v_key_id uuid; v_number_id uuid; v_allowed jsonb; v_diff jsonb;
 v_current jsonb; v_action text; v_meta_changed boolean;
 v_details public.centris_property_details; v_new public.centris_property_details;
 v_details_changed boolean:=false; v_price_changed boolean:=false; v_status_changed boolean:=false;
 v_old_price numeric; v_price numeric; v_revision bigint; v_event_key text; v_price_at timestamptz; v_status_at timestamptz;
 v_previous_standard text; v_previous_mls text; v_previous_modified timestamptz; v_existing boolean;
 v_context text; v_changes integer:=0;
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

 v_existing:=v_row.id is not null;
 v_previous_standard:=v_row.centris_standard_status; v_previous_mls:=v_row.centris_mls_status;
 v_previous_modified:=v_row.centris_modification_timestamp;
 select * into v_details from public.centris_property_details where listing_id=v_row.id;
 v_old_price:=case when v_details.listing_id is not null then v_details.source_price
   when v_row.purpose='rental' then v_row.monthly_rent else v_row.asking_price end;
 v_price:=case when p_values->>'purpose'='rental' then (p_values->>'monthlyRent')::numeric else (p_values->>'askingPrice')::numeric end;
 if v_price is null then v_allowed:=v_allowed-'askingPrice'-'monthlyRent'; end if;
 v_price_changed:=v_existing and v_price is not null and v_old_price is not null and v_price is distinct from v_old_price;
 v_status_changed:=v_existing and v_previous_standard is not null and
  (v_previous_standard is distinct from p_source->>'standard' or v_previous_mls is distinct from p_source->>'mls');
 v_revision:=coalesce(v_details.revision,0)+case when v_price_changed or v_status_changed then 1 else 0 end;
 v_new:=jsonb_populate_record(null::public.centris_property_details,coalesce(p_source->'details',to_jsonb(v_details),'{}'));
   v_new.listing_id:=v_row.id; v_new.source_price:=coalesce(v_price,v_details.source_price);
   v_new.source_purpose:=p_values->>'purpose'; v_new.revision:=v_revision;
   v_new.last_change_at:=case when v_price_changed or v_status_changed then now() else v_details.last_change_at end;
   v_new.last_change_kind:=case when v_price_changed and v_status_changed then 'price_status'
     when v_price_changed then 'price' when v_status_changed then 'status' else v_details.last_change_kind end;
   v_details_changed:=(to_jsonb(v_new)-'updated_at') is distinct from (to_jsonb(v_details)-'updated_at');
   v_new.updated_at:=now();
   if v_new.price_changed_at>v_previous_modified and v_new.price_changed_at<=(p_source->>'modified')::timestamptz then v_price_at:=v_new.price_changed_at; end if;
   if v_new.status_changed_at>v_previous_modified and v_new.status_changed_at<=(p_source->>'modified')::timestamptz then v_status_at:=v_new.status_changed_at; end if;

 v_context:=current_setting('crm.centris_context',true);
 if not p_dry_run then perform set_config('crm.centris_context',jsonb_build_object('existing',v_existing)::text,true); end if;
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
   if v_diff='{}' and not v_meta_changed and not v_details_changed and not v_price_changed and not v_status_changed then
     if not p_dry_run then perform set_config('crm.centris_context',coalesce(v_context,''),true); end if;
     return jsonb_build_object('action','unchanged','id',v_row.id,'changes',0);
   end if;
   v_action:='updated';
   if not p_dry_run and v_diff<>'{}' then
     select * into v_row from public.update_listing_with_owners(v_row.id,v_diff||jsonb_build_object('actorBroker',p_actor),null);
   end if;
 end if;
 if not p_dry_run then
   perform set_config('crm.centris_context',coalesce(v_context,''),true);
   if v_details_changed or not v_existing then
     v_new.listing_id:=v_row.id;
     insert into public.centris_property_details select (v_new).*
     on conflict(listing_id) do update set bedrooms_total=excluded.bedrooms_total,above_ground_bedrooms=excluded.above_ground_bedrooms,basement_bedrooms=excluded.basement_bedrooms,bathrooms_full=excluded.bathrooms_full,bathrooms_partial=excluded.bathrooms_partial,living_area=excluded.living_area,living_area_units=excluded.living_area_units,lot_area=excluded.lot_area,lot_area_units=excluded.lot_area_units,year_built=excluded.year_built,garage=excluded.garage,garage_spaces=excluded.garage_spaces,parking_total=excluded.parking_total,property_type=excluded.property_type,property_subtype=excluded.property_subtype,public_remarks=excluded.public_remarks,price_changed_at=excluded.price_changed_at,status_changed_at=excluded.status_changed_at,source_price=excluded.source_price,source_purpose=excluded.source_purpose,revision=excluded.revision,last_change_at=excluded.last_change_at,last_change_kind=excluded.last_change_kind,updated_at=excluded.updated_at;
   end if;
   if v_price_changed then
     v_event_key:=v_row.id::text||':'||v_revision::text||':price';
     insert into public.listing_price_history(listing_id,purpose,amount,source,source_at,source_event_key)
     values(v_row.id,p_values->>'purpose',v_price,'centris',v_price_at,v_event_key);
     insert into public.listing_activity(listing_id,event_type,title,detail,metadata,source,source_at,source_event_key)
     values(v_row.id,case when p_values->>'purpose'='rental' then 'rent_changed' else 'price_changed' end,
       case when p_values->>'purpose'='rental' then 'Loyer modifié par Centris' else 'Prix modifié par Centris' end,
       v_old_price::text||' → '||v_price::text,jsonb_build_object('before',v_old_price,'after',v_price,'purpose',p_values->>'purpose'),
       'centris',v_price_at,v_event_key);
   end if;
   if v_status_changed then
     v_event_key:=v_row.id::text||':'||v_revision::text||':status';
     insert into public.listing_activity(listing_id,event_type,title,detail,metadata,source,source_at,source_event_key)
     values(v_row.id,'centris_status_changed','Statut Centris modifié',
       concat_ws(' / ',v_previous_standard,v_previous_mls)||' → '||concat_ws(' / ',p_source->>'standard',p_source->>'mls'),
       jsonb_build_object('before',jsonb_build_object('standard',v_previous_standard,'mls',v_previous_mls),
         'after',jsonb_build_object('standard',p_source->>'standard','mls',p_source->>'mls')),
       'centris',v_status_at,v_event_key);
   end if;
   update public.listings set centris_listing_key=p_source->>'key',centris_standard_status=p_source->>'standard',
    centris_mls_status=p_source->>'mls',centris_modification_timestamp=(p_source->>'modified')::timestamptz,
    centris_last_synced_at=now(),centris_list_agent_key=p_source->>'agent',centris_co_list_agent_key=p_source->>'coAgent',
    centris_media_key=p_source->>'mediaKey' where id=v_row.id;
 end if;
 return jsonb_build_object('action',v_action,'id',v_row.id,'changes',(case when v_price_changed then 1 else 0 end)+(case when v_status_changed then 1 else 0 end));
exception when unique_violation then return jsonb_build_object('action','conflict','reason','Identité Centris en conflit.');
end $$;
