begin;

create extension if not exists unaccent;

create table if not exists public.contact_addresses (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  civic_number text not null default '',
  address text not null default '',
  apartment text not null default '',
  city text not null default '',
  province text not null default '',
  postal_code text not null default '',
  country text not null default '',
  is_primary boolean not null default false,
  label text not null default 'Ancienne adresse' check (label = any (array['Principale', 'Ancienne adresse', 'Résidence secondaire', 'Autre'])),
  normalized_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.normalize_contact_address_part(p_value text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select trim(regexp_replace(lower(unaccent(coalesce(trim(p_value), ''))), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.normalize_contact_address(
  p_civic_number text, p_address text, p_apartment text, p_city text,
  p_province text, p_postal_code text, p_country text
)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select array_to_string(array[
    public.normalize_contact_address_part(p_civic_number),
    public.normalize_contact_address_part(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(unaccent(coalesce(trim(p_address), ''))), '\mav\.?\M', 'avenue', 'g'),
          '\mboul\.?\M', 'boulevard', 'g'),
        '\mch\.?\M', 'chemin', 'g')),
    public.normalize_contact_address_part(p_apartment),
    public.normalize_contact_address_part(p_city),
    public.normalize_contact_address_part(p_province),
    replace(public.normalize_contact_address_part(p_postal_code), ' ', ''),
    public.normalize_contact_address_part(p_country)
  ], '|');
$$;

create unique index if not exists contact_addresses_one_primary_idx
  on public.contact_addresses (contact_id) where is_primary;
create unique index if not exists contact_addresses_contact_normalized_idx
  on public.contact_addresses (contact_id, normalized_key);
create index if not exists contact_addresses_contact_idx
  on public.contact_addresses (contact_id, created_at desc);
create index if not exists contact_addresses_address_trgm_idx
  on public.contact_addresses using gin (address gin_trgm_ops);
create index if not exists contact_addresses_city_trgm_idx
  on public.contact_addresses using gin (city gin_trgm_ops);
create index if not exists contact_addresses_postal_trgm_idx
  on public.contact_addresses using gin (postal_code gin_trgm_ops);

drop trigger if exists contact_addresses_set_updated_at on public.contact_addresses;
create trigger contact_addresses_set_updated_at
before update on public.contact_addresses
for each row execute function public.set_updated_at();

update public.contact_addresses a
set is_primary=false, label=case when label='Principale' then 'Ancienne adresse' else label end
where exists (
  select 1 from public.contacts c where c.id=a.contact_id
  and length(trim(concat_ws('',c.civic_number,c.address,c.apartment,c.city,c.province,c.postal_code,c.country)))>0
);

insert into public.contact_addresses (
  contact_id, civic_number, address, apartment, city, province, postal_code, country,
  is_primary, label, normalized_key
)
select
  c.id, c.civic_number, c.address, c.apartment, c.city, c.province, c.postal_code, c.country,
  true, 'Principale',
  public.normalize_contact_address(c.civic_number, c.address, c.apartment, c.city, c.province, c.postal_code, c.country)
from public.contacts c
where length(trim(concat_ws('', c.civic_number, c.address, c.apartment, c.city, c.province, c.postal_code, c.country))) > 0
on conflict (contact_id, normalized_key) do update
set is_primary = true, label = 'Principale';

create or replace function public.save_contact_addresses(p_contact_id uuid, p_addresses jsonb)
returns public.contacts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_item jsonb;
  v_key text;
  v_primary_key text;
  v_kept_keys text[] := array[]::text[];
  v_primary public.contact_addresses;
  v_result public.contacts;
begin
  perform 1 from public.contacts where id = p_contact_id for update;
  if not found then raise exception 'Contact introuvable'; end if;

  update public.contact_addresses set is_primary = false, label = case when label = 'Principale' then 'Ancienne adresse' else label end where contact_id = p_contact_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_addresses, '[]'::jsonb)) loop
    v_key := public.normalize_contact_address(
      v_item->>'civic_number', v_item->>'address', v_item->>'apartment', v_item->>'city',
      v_item->>'province', v_item->>'postal_code', v_item->>'country'
    );
    if replace(v_key, '|', '') = '' or v_key = any(v_kept_keys) then continue; end if;
    v_kept_keys := array_append(v_kept_keys, v_key);
    if coalesce((v_item->>'is_primary')::boolean, false) and v_primary_key is null then v_primary_key := v_key; end if;

    insert into public.contact_addresses (
      contact_id, civic_number, address, apartment, city, province, postal_code, country,
      is_primary, label, normalized_key
    ) values (
      p_contact_id,
      trim(coalesce(v_item->>'civic_number', '')), trim(coalesce(v_item->>'address', '')),
      trim(coalesce(v_item->>'apartment', '')), trim(coalesce(v_item->>'city', '')),
      trim(coalesce(v_item->>'province', '')), trim(coalesce(v_item->>'postal_code', '')),
      trim(coalesce(v_item->>'country', '')), false,
      case when v_item->>'label' = any(array['Ancienne adresse', 'Résidence secondaire', 'Autre']) then v_item->>'label' else 'Ancienne adresse' end,
      v_key
    )
    on conflict (contact_id, normalized_key) do update set
      civic_number = excluded.civic_number, address = excluded.address, apartment = excluded.apartment,
      city = excluded.city, province = excluded.province, postal_code = excluded.postal_code,
      country = excluded.country, label = excluded.label;
  end loop;

  if cardinality(v_kept_keys) = 0 then
    delete from public.contact_addresses where contact_id = p_contact_id;
    update public.contacts set civic_number='', address='', apartment='', city='', province='', postal_code='', country='' where id=p_contact_id returning * into v_result;
    return v_result;
  end if;

  delete from public.contact_addresses where contact_id = p_contact_id and not (normalized_key = any(v_kept_keys));
  v_primary_key := coalesce(v_primary_key, v_kept_keys[1]);
  update public.contact_addresses set
    is_primary = normalized_key = v_primary_key,
    label = case when normalized_key = v_primary_key then 'Principale' when label = 'Principale' then 'Ancienne adresse' else label end
  where contact_id = p_contact_id;

  select * into v_primary from public.contact_addresses where contact_id = p_contact_id and is_primary;
  update public.contacts set
    civic_number=v_primary.civic_number, address=v_primary.address, apartment=v_primary.apartment,
    city=v_primary.city, province=v_primary.province, postal_code=v_primary.postal_code, country=v_primary.country
  where id=p_contact_id returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.import_contacts_with_addresses(p_entries jsonb, p_source public.contact_source)
returns setof public.contacts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_entry jsonb; v_contact public.contacts;
begin
  for v_entry in select value from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    insert into public.contacts (first_name,last_name,phone,email,civic_number,address,apartment,city,province,postal_code,country,broker,source)
    values (
      trim(coalesce(v_entry#>>'{contact,firstName}','')), trim(coalesce(v_entry#>>'{contact,lastName}','')),
      trim(coalesce(v_entry#>>'{contact,phone}','')), trim(coalesce(v_entry#>>'{contact,email}','')),
      trim(coalesce(v_entry#>>'{contact,civicNumber}','')), trim(coalesce(v_entry#>>'{contact,address}','')),
      trim(coalesce(v_entry#>>'{contact,apartment}','')), trim(coalesce(v_entry#>>'{contact,city}','')),
      trim(coalesce(v_entry#>>'{contact,province}','')), trim(coalesce(v_entry#>>'{contact,postalCode}','')),
      trim(coalesce(v_entry#>>'{contact,country}','')), 'unassigned', p_source
    ) returning * into v_contact;
    if jsonb_array_length(coalesce(v_entry->'addresses','[]'::jsonb)) > 0 then
      select * into v_contact from public.save_contact_addresses(v_contact.id, v_entry->'addresses');
    end if;
    return next v_contact;
  end loop;
end;
$$;

create or replace function public.merge_draft_into_contact_with_addresses(
  p_target_id uuid, p_values jsonb, p_addresses jsonb, p_incoming_draft jsonb, p_merged_by_user_id uuid
)
returns public.contacts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_result public.contacts;
begin
  perform 1 from public.contacts where id=p_target_id for update;
  if not found then raise exception 'Contact introuvable'; end if;
  update public.contacts set
    first_name=trim(coalesce(p_values->>'firstName','')), last_name=trim(coalesce(p_values->>'lastName','')),
    phone=trim(coalesce(p_values->>'phone','')), email=trim(coalesce(p_values->>'email','')),
    broker=(p_values->>'broker')::public.broker_assignment,
    next_follow_up_date=nullif(p_values->>'nextFollowUpDate','')::date,
    google_calendar_sync_status=case when nullif(p_values->>'nextFollowUpDate','') is null then google_calendar_sync_status else 'pending' end,
    google_calendar_last_error=null
  where id=p_target_id;
  select * into v_result from public.save_contact_addresses(p_target_id, p_addresses);
  insert into public.contact_merges(merged_into_contact_id,merged_from,merged_by_user_id) values(p_target_id,p_incoming_draft,p_merged_by_user_id);
  return v_result;
end;
$$;

create or replace function public.merge_contacts_with_addresses(
  p_target_id uuid, p_source_id uuid, p_addresses jsonb,
  p_first_name text, p_last_name text, p_phone text, p_email text,
  p_civic_number text, p_address text, p_apartment text, p_city text, p_province text, p_postal_code text, p_country text,
  p_broker public.broker_assignment, p_client_type public.client_type, p_priority public.contact_priority, p_status public.contact_status,
  p_next_follow_up_date date, p_google_event_id text, p_google_event_broker public.broker_assignment, p_merged_by_user_id uuid
)
returns public.contacts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_source public.contacts; v_target public.contacts; v_result public.contacts; v_last_contact timestamptz; v_addresses jsonb;
begin
  if p_target_id=p_source_id then raise exception 'Les contacts à fusionner doivent être différents'; end if;
  select * into v_target from public.contacts where id=p_target_id for update;
  select * into v_source from public.contacts where id=p_source_id for update;
  if v_target.id is null or v_source.id is null then raise exception 'Contact de fusion introuvable'; end if;

  update public.client_notes set contact_id=p_target_id where contact_id=p_source_id;
  update public.pipeline_history set contact_id=p_target_id where contact_id=p_source_id;
  insert into public.transaction_contacts(transaction_id,contact_id)
    select transaction_id,p_target_id from public.transaction_contacts where contact_id=p_source_id on conflict do nothing;
  delete from public.transaction_contacts where contact_id=p_source_id;
  select max(created_at) into v_last_contact from public.client_notes where contact_id=p_target_id;

  update public.contacts set
    first_name=trim(p_first_name),last_name=trim(p_last_name),phone=trim(p_phone),email=trim(p_email),
    civic_number=trim(p_civic_number),address=trim(p_address),apartment=trim(p_apartment),city=trim(p_city),province=trim(p_province),postal_code=trim(p_postal_code),country=trim(p_country),
    broker=p_broker,client_type=p_client_type,priority=p_priority,status=p_status,
    last_contact_date=greatest(v_target.last_contact_date,v_source.last_contact_date,v_last_contact),
    next_follow_up_date=p_next_follow_up_date,google_calendar_event_id=p_google_event_id,google_calendar_event_broker=p_google_event_broker,
    google_calendar_sync_status=case when p_next_follow_up_date is null then 'synced' else 'pending' end,google_calendar_last_error=null
  where id=p_target_id;

  v_addresses := coalesce(p_addresses,'[]'::jsonb);
  if jsonb_array_length(v_addresses)=0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'civic_number',civic_number,'address',address,'apartment',apartment,'city',city,'province',province,'postal_code',postal_code,'country',country,
      'is_primary',contact_id=p_target_id and is_primary,'label',case when contact_id=p_target_id and is_primary then 'Principale' else 'Ancienne adresse' end
    ) order by (contact_id=p_target_id and is_primary) desc),'[]'::jsonb) into v_addresses
    from public.contact_addresses where contact_id in (p_target_id,p_source_id);
  end if;
  if jsonb_array_length(v_addresses)>0 then select * into v_result from public.save_contact_addresses(p_target_id,v_addresses); end if;
  insert into public.contact_merges(merged_into_contact_id,merged_from,merged_by_user_id) values(p_target_id,to_jsonb(v_source),p_merged_by_user_id);
  delete from public.contacts where id=p_source_id;
  select * into v_result from public.contacts where id=p_target_id;
  return v_result;
end;
$$;

alter table public.contact_addresses enable row level security;
revoke all on public.contact_addresses from anon, authenticated;
grant select, insert, update, delete on public.contact_addresses to service_role;
grant usage on type public.contact_source to service_role;
revoke execute on function public.save_contact_addresses(uuid,jsonb) from public,anon,authenticated;
revoke execute on function public.import_contacts_with_addresses(jsonb,public.contact_source) from public,anon,authenticated;
revoke execute on function public.merge_draft_into_contact_with_addresses(uuid,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_contact_addresses(uuid,jsonb) to service_role;
grant execute on function public.import_contacts_with_addresses(jsonb,public.contact_source) to service_role;
grant execute on function public.merge_draft_into_contact_with_addresses(uuid,jsonb,jsonb,jsonb,uuid) to service_role;
revoke execute on function public.merge_contacts_with_addresses(
  uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text,text,text,
  public.broker_assignment,public.client_type,public.contact_priority,public.contact_status,date,text,public.broker_assignment,uuid
) from public,anon,authenticated;
grant execute on function public.merge_contacts_with_addresses(
  uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text,text,text,
  public.broker_assignment,public.client_type,public.contact_priority,public.contact_status,date,text,public.broker_assignment,uuid
) to service_role;

commit;
