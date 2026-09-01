begin;

alter table public.google_drive_roots
  add constraint google_drive_roots_id_broker_unique unique (id, broker);

create table public.google_drive_entity_links (
  id uuid primary key default gen_random_uuid(),
  broker public.broker_assignment not null,
  root_id uuid not null,
  folder_id text not null,
  folder_name text not null,
  web_view_link text,
  contact_id uuid references public.contacts(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint google_drive_entity_links_assigned_broker_check check (broker <> 'unassigned'),
  constraint google_drive_entity_links_folder_id_check check (length(trim(folder_id)) between 5 and 200),
  constraint google_drive_entity_links_folder_name_check check (length(trim(folder_name)) between 1 and 500),
  constraint google_drive_entity_links_exactly_one_entity_check check (
    num_nonnulls(contact_id, listing_id, transaction_id) = 1
  ),
  constraint google_drive_entity_links_root_broker_fkey
    foreign key (root_id, broker)
    references public.google_drive_roots(id, broker)
    on delete cascade
);

create unique index google_drive_entity_links_contact_unique_idx
  on public.google_drive_entity_links (root_id, folder_id, contact_id)
  where contact_id is not null;

create unique index google_drive_entity_links_listing_unique_idx
  on public.google_drive_entity_links (root_id, folder_id, listing_id)
  where listing_id is not null;

create unique index google_drive_entity_links_transaction_unique_idx
  on public.google_drive_entity_links (root_id, folder_id, transaction_id)
  where transaction_id is not null;

create index google_drive_entity_links_broker_idx
  on public.google_drive_entity_links (broker, created_at, id);

alter table public.google_drive_entity_links enable row level security;

revoke all on public.google_drive_entity_links from public, anon, authenticated;
grant select, insert, update, delete on public.google_drive_entity_links to service_role;

commit;
