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
  asking_price numeric(14, 2),
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
      'expired',
      'withdrawn'
    ])
  ),
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

alter table public.listings enable row level security;
alter table public.listing_contacts enable row level security;

revoke all on public.listings from public, anon, authenticated;
revoke all on public.listing_contacts from public, anon, authenticated;

grant select, insert, update, delete on public.listings to service_role;
grant select, insert, update, delete on public.listing_contacts to service_role;

commit;
