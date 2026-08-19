begin;

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  civic_number text not null default '',
  address text not null default '',
  apartment text not null default '',
  city text not null default '',
  province text not null default '',
  postal_code text not null default '',
  country text not null default '',
  centris_number text not null default '',
  broker public.broker_assignment not null,
  status text not null default 'preparation',
  purpose text not null default 'sale',
  asking_price numeric(14, 2),
  monthly_rent numeric(14, 2),
  property_type text not null default 'other',
  listing_date date,
  expiration_date date,
  centris_url text not null default '',
  public_url text not null default '',
  primary_image_url text not null default '',
  general_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_assigned_broker_check check (broker <> 'unassigned'),
  constraint listings_status_check check (
    status = any (array[
      'preparation',
      'coming_soon',
      'active',
      'offer_received',
      'conditional',
      'sold',
      'rented',
      'expired',
      'withdrawn'
    ])
  ),
  constraint listings_purpose_check check (purpose = any (array['sale', 'rental'])),
  constraint listings_asking_price_check check (asking_price is null or asking_price >= 0),
  constraint listings_monthly_rent_check check (monthly_rent is null or monthly_rent >= 0),
  constraint listings_property_type_check check (
    property_type = any (array[
      'residential',
      'condo',
      'income_property',
      'land',
      'commercial',
      'other'
    ])
  ),
  constraint listings_date_range_check check (
    listing_date is null
    or expiration_date is null
    or expiration_date >= listing_date
  )
);

create table if not exists public.listing_contacts (
  listing_id uuid not null references public.listings(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (listing_id, contact_id),
  constraint listing_contacts_role_check check (role = 'owner')
);

create unique index if not exists listings_centris_number_unique_idx
  on public.listings (upper(regexp_replace(trim(centris_number), '\s+', '', 'g')))
  where length(trim(centris_number)) > 0;

create index if not exists listings_broker_idx
  on public.listings (broker);
create index if not exists listings_status_idx
  on public.listings (status);
create index if not exists listings_broker_status_idx
  on public.listings (broker, status);
create index if not exists listings_updated_at_idx
  on public.listings (updated_at desc);
create index if not exists listing_contacts_contact_idx
  on public.listing_contacts (contact_id, listing_id);

drop trigger if exists listings_set_updated_at on public.listings;
create trigger listings_set_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

create or replace function public.create_listing_with_owners(
  p_values jsonb,
  p_owner_contact_ids uuid[]
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
begin
  if exists (
    select 1
    from unnest(coalesce(p_owner_contact_ids, array[]::uuid[])) as requested(owner_id)
    left join public.contacts as contacts on contacts.id = requested.owner_id
    where contacts.id is null
  ) then
    raise exception 'Propriétaire invalide' using errcode = 'P0001';
  end if;

  insert into public.listings (
    civic_number,
    address,
    apartment,
    city,
    province,
    postal_code,
    country,
    centris_number,
    broker,
    status,
    purpose,
    asking_price,
    monthly_rent,
    property_type,
    listing_date,
    expiration_date,
    centris_url,
    public_url,
    primary_image_url,
    general_notes
  ) values (
    trim(coalesce(p_values->>'civicNumber', '')),
    trim(coalesce(p_values->>'address', '')),
    trim(coalesce(p_values->>'apartment', '')),
    trim(coalesce(p_values->>'city', '')),
    trim(coalesce(p_values->>'province', '')),
    trim(coalesce(p_values->>'postalCode', '')),
    trim(coalesce(p_values->>'country', '')),
    trim(coalesce(p_values->>'centrisNumber', '')),
    (p_values->>'broker')::public.broker_assignment,
    p_values->>'status',
    p_values->>'purpose',
    nullif(p_values->>'askingPrice', '')::numeric,
    nullif(p_values->>'monthlyRent', '')::numeric,
    p_values->>'propertyType',
    nullif(p_values->>'listingDate', '')::date,
    nullif(p_values->>'expirationDate', '')::date,
    trim(coalesce(p_values->>'centrisUrl', '')),
    trim(coalesce(p_values->>'publicUrl', '')),
    trim(coalesce(p_values->>'primaryImageUrl', '')),
    trim(coalesce(p_values->>'generalNotes', ''))
  )
  returning * into v_listing;

  insert into public.listing_contacts (listing_id, contact_id, role)
  select v_listing.id, owners.owner_id, 'owner'
  from (
    select distinct owner_id
    from unnest(coalesce(p_owner_contact_ids, array[]::uuid[])) as requested(owner_id)
  ) as owners;

  return v_listing;
end;
$$;

create or replace function public.update_listing_with_owners(
  p_listing_id uuid,
  p_values jsonb,
  p_owner_contact_ids uuid[] default null
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
begin
  if p_owner_contact_ids is not null and exists (
    select 1
    from unnest(p_owner_contact_ids) as requested(owner_id)
    left join public.contacts as contacts on contacts.id = requested.owner_id
    where contacts.id is null
  ) then
    raise exception 'Propriétaire invalide' using errcode = 'P0001';
  end if;

  update public.listings
  set
    civic_number = case when p_values ? 'civicNumber' then trim(coalesce(p_values->>'civicNumber', '')) else civic_number end,
    address = case when p_values ? 'address' then trim(coalesce(p_values->>'address', '')) else address end,
    apartment = case when p_values ? 'apartment' then trim(coalesce(p_values->>'apartment', '')) else apartment end,
    city = case when p_values ? 'city' then trim(coalesce(p_values->>'city', '')) else city end,
    province = case when p_values ? 'province' then trim(coalesce(p_values->>'province', '')) else province end,
    postal_code = case when p_values ? 'postalCode' then trim(coalesce(p_values->>'postalCode', '')) else postal_code end,
    country = case when p_values ? 'country' then trim(coalesce(p_values->>'country', '')) else country end,
    centris_number = case when p_values ? 'centrisNumber' then trim(coalesce(p_values->>'centrisNumber', '')) else centris_number end,
    broker = case when p_values ? 'broker' then (p_values->>'broker')::public.broker_assignment else broker end,
    status = case when p_values ? 'status' then p_values->>'status' else status end,
    purpose = case when p_values ? 'purpose' then p_values->>'purpose' else purpose end,
    asking_price = case when p_values ? 'askingPrice' then nullif(p_values->>'askingPrice', '')::numeric else asking_price end,
    monthly_rent = case when p_values ? 'monthlyRent' then nullif(p_values->>'monthlyRent', '')::numeric else monthly_rent end,
    property_type = case when p_values ? 'propertyType' then p_values->>'propertyType' else property_type end,
    listing_date = case when p_values ? 'listingDate' then nullif(p_values->>'listingDate', '')::date else listing_date end,
    expiration_date = case when p_values ? 'expirationDate' then nullif(p_values->>'expirationDate', '')::date else expiration_date end,
    centris_url = case when p_values ? 'centrisUrl' then trim(coalesce(p_values->>'centrisUrl', '')) else centris_url end,
    public_url = case when p_values ? 'publicUrl' then trim(coalesce(p_values->>'publicUrl', '')) else public_url end,
    primary_image_url = case when p_values ? 'primaryImageUrl' then trim(coalesce(p_values->>'primaryImageUrl', '')) else primary_image_url end,
    general_notes = case when p_values ? 'generalNotes' then trim(coalesce(p_values->>'generalNotes', '')) else general_notes end
  where id = p_listing_id
  returning * into v_listing;

  if not found then
    raise exception 'Listing introuvable' using errcode = 'P0001';
  end if;

  if p_owner_contact_ids is not null then
    delete from public.listing_contacts where listing_id = p_listing_id;
    insert into public.listing_contacts (listing_id, contact_id, role)
    select p_listing_id, owners.owner_id, 'owner'
    from (
      select distinct owner_id
      from unnest(p_owner_contact_ids) as requested(owner_id)
    ) as owners;
  end if;

  return v_listing;
end;
$$;

alter table public.listings enable row level security;
alter table public.listing_contacts enable row level security;

revoke all on public.listings from public, anon, authenticated;
revoke all on public.listing_contacts from public, anon, authenticated;
revoke execute on function public.create_listing_with_owners(jsonb, uuid[]) from public, anon, authenticated;
revoke execute on function public.update_listing_with_owners(uuid, jsonb, uuid[]) from public, anon, authenticated;

grant select, insert, update, delete on public.listings to service_role;
grant select, insert, update, delete on public.listing_contacts to service_role;
grant execute on function public.create_listing_with_owners(jsonb, uuid[]) to service_role;
grant execute on function public.update_listing_with_owners(uuid, jsonb, uuid[]) to service_role;

commit;
