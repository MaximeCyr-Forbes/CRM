-- Équipe Forbes CRM — schéma Supabase
-- À exécuter dans l’éditeur SQL du projet Supabase.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

do $$ begin
  create type public.broker_assignment as enum ('france', 'maxime', 'sandrine', 'unassigned');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.client_type as enum ('buyer', 'seller');
exception when duplicate_object then null;
end $$;

alter type public.client_type add value if not exists 'buyer_seller';

do $$ begin
  create type public.contact_priority as enum ('hot', 'warm', 'cold');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.contact_status as enum ('active', 'inactive');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.contact_source as enum ('manual', 'csv', 'vcard');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.calendar_sync_status as enum ('synced', 'pending', 'error');
exception when duplicate_object then null;
end $$;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  phone text not null default '',
  email text not null default '',
  civic_number text not null default '',
  address text not null default '',
  apartment text not null default '',
  city text not null default '',
  province text not null default '',
  postal_code text not null default '',
  country text not null default '',
  broker public.broker_assignment not null default 'unassigned',
  client_type public.client_type,
  priority public.contact_priority,
  status public.contact_status not null default 'active',
  source public.contact_source not null default 'manual',
  last_contact_date timestamptz,
  next_follow_up_date date,
  google_calendar_event_id text,
  google_calendar_event_broker public.broker_assignment,
  google_calendar_sync_status public.calendar_sync_status not null default 'synced',
  google_calendar_last_error text,
  buyer_pipeline_stage text not null default 'new',
  seller_pipeline_stage text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_name_or_coordinates_check check (
    length(trim(first_name)) > 0
    or length(trim(last_name)) > 0
    or length(trim(phone)) > 0
    or length(trim(email)) > 0
  ),
  constraint contacts_google_event_broker_check check (
    google_calendar_event_broker is null
    or google_calendar_event_broker <> 'unassigned'
  ),
  constraint contacts_buyer_pipeline_stage_check check (
    buyer_pipeline_stage = any (array['new', 'qualified', 'search', 'visits', 'offer', 'conditions', 'notary', 'purchased', 'long_term'])
  ),
  constraint contacts_seller_pipeline_stage_check check (
    seller_pipeline_stage = any (array['new', 'to_contact', 'evaluation', 'follow_up', 'contract_signed', 'on_market', 'offer_received', 'conditions', 'notary', 'sold', 'long_term'])
  )
);

alter table public.contacts
  add column if not exists civic_number text not null default '',
  add column if not exists address text not null default '',
  add column if not exists apartment text not null default '',
  add column if not exists city text not null default '',
  add column if not exists province text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists country text not null default '',
  add column if not exists google_calendar_event_id text,
  add column if not exists google_calendar_event_broker public.broker_assignment,
  add column if not exists google_calendar_sync_status public.calendar_sync_status not null default 'synced',
  add column if not exists google_calendar_last_error text,
  add column if not exists buyer_pipeline_stage text not null default 'new',
  add column if not exists seller_pipeline_stage text not null default 'new';

do $$ begin
  alter table public.contacts
    add constraint contacts_google_event_broker_check check (
      google_calendar_event_broker is null
      or google_calendar_event_broker <> 'unassigned'
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.contacts
    add constraint contacts_buyer_pipeline_stage_check check (
      buyer_pipeline_stage = any (array['new', 'qualified', 'search', 'visits', 'offer', 'conditions', 'notary', 'purchased', 'long_term'])
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.contacts
    add constraint contacts_seller_pipeline_stage_check check (
      seller_pipeline_stage = any (array['new', 'to_contact', 'evaluation', 'follow_up', 'contract_signed', 'on_market', 'offer_received', 'conditions', 'notary', 'sold', 'long_term'])
    );
exception when duplicate_object then null;
end $$;

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  content text not null check (length(trim(content)) > 0),
  created_at timestamptz not null default now(),
  created_by public.broker_assignment not null,
  created_by_user_id uuid references auth.users(id) on delete set null
);

alter table public.client_notes
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

create table if not exists public.contact_merges (
  id uuid primary key default gen_random_uuid(),
  merged_into_contact_id uuid references public.contacts(id) on delete set null,
  merged_from jsonb not null,
  merged_by_user_id uuid references auth.users(id) on delete set null,
  merged_at timestamptz not null default now()
);

create table if not exists public.pipeline_history (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  pipeline_type text not null check (pipeline_type = any (array['buyer', 'seller'])),
  from_stage text,
  to_stage text not null,
  changed_by_user_id uuid references auth.users(id) on delete set null,
  changed_by_broker public.broker_assignment,
  changed_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  address text not null check (length(trim(address)) > 0),
  type text not null check (type = any (array['purchase', 'sale'])),
  broker public.broker_assignment not null check (broker <> 'unassigned'),
  price numeric(14, 2),
  promise_date date,
  status text not null default 'new' check (
    status = any (array[
      'new', 'pa_preparation', 'pa_sent', 'pa_accepted', 'inspection',
      'financing', 'other_conditions', 'conditions_met', 'notary',
      'completed', 'cancelled', 'on_market', 'offer_received', 'negotiation'
    ])
  ),
  general_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transaction_contacts (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (transaction_id, contact_id)
);

create table if not exists public.transaction_deadlines (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  due_date date not null,
  completed boolean not null default false,
  google_calendar_event_id text,
  google_calendar_event_broker public.broker_assignment,
  google_calendar_sync_status public.calendar_sync_status not null default 'synced',
  google_calendar_last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_deadlines_google_broker_check check (
    google_calendar_event_broker is null or google_calendar_event_broker <> 'unassigned'
  )
);

create table if not exists public.transaction_notes (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  content text not null check (length(trim(content)) > 0),
  created_at timestamptz not null default now()
);

alter table public.pipeline_history
  add column if not exists changed_by_broker public.broker_assignment;

-- Les jetons sont chiffrés par le serveur avant d’être enregistrés ici.
-- Cette table n’est jamais exposée au rôle anon.
create table if not exists public.google_calendar_connections (
  broker public.broker_assignment primary key,
  google_account_email text not null,
  calendar_id text not null default 'primary',
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  access_token_expires_at timestamptz not null,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_connections_assigned_broker_check check (broker <> 'unassigned')
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

drop trigger if exists transaction_deadlines_set_updated_at on public.transaction_deadlines;
create trigger transaction_deadlines_set_updated_at
before update on public.transaction_deadlines
for each row execute function public.set_updated_at();

drop trigger if exists google_calendar_connections_set_updated_at on public.google_calendar_connections;
create trigger google_calendar_connections_set_updated_at
before update on public.google_calendar_connections
for each row execute function public.set_updated_at();

drop function if exists public.add_client_note(uuid, text, public.broker_assignment);

-- Une seule requête pour l’attribution individuelle ou en lot.
create or replace function public.assign_contacts(
  p_contact_ids uuid[],
  p_broker public.broker_assignment
)
returns setof public.contacts
language sql
set search_path = public
as $$
  update public.contacts
  set
    broker = p_broker,
    google_calendar_sync_status = case
      when next_follow_up_date is not null or google_calendar_event_id is not null then 'pending'
      else 'synced'
    end,
    google_calendar_last_error = null
  where id = any(p_contact_ids)
  returning *;
$$;

-- Fusion atomique de deux contacts existants. Les appels sont réservés au
-- serveur: les notes sont déplacées avant la suppression du doublon.
drop function if exists public.merge_contacts(
  uuid, uuid, text, text, text, text,
  public.broker_assignment, public.client_type, public.contact_priority,
  public.contact_status, date, text, public.broker_assignment, uuid
);

drop function if exists public.merge_contacts(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  public.broker_assignment, public.client_type, public.contact_priority,
  public.contact_status, date, text, public.broker_assignment, uuid
);

create or replace function public.merge_contacts(
  p_target_id uuid,
  p_source_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_civic_number text,
  p_address text,
  p_apartment text,
  p_city text,
  p_province text,
  p_postal_code text,
  p_country text,
  p_broker public.broker_assignment,
  p_client_type public.client_type,
  p_priority public.contact_priority,
  p_status public.contact_status,
  p_next_follow_up_date date,
  p_google_event_id text,
  p_google_event_broker public.broker_assignment,
  p_merged_by_user_id uuid
)
returns public.contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.contacts;
  v_target public.contacts;
  v_result public.contacts;
  v_last_contact timestamptz;
begin
  if p_target_id = p_source_id then
    raise exception 'Les contacts à fusionner doivent être différents';
  end if;

  select * into v_target from public.contacts where id = p_target_id for update;
  select * into v_source from public.contacts where id = p_source_id for update;
  if v_target.id is null or v_source.id is null then
    raise exception 'Contact de fusion introuvable';
  end if;

  update public.client_notes
  set contact_id = p_target_id
  where contact_id = p_source_id;

  update public.pipeline_history
  set contact_id = p_target_id
  where contact_id = p_source_id;

  select max(created_at) into v_last_contact
  from public.client_notes
  where contact_id = p_target_id;

  update public.contacts
  set
    first_name = trim(p_first_name),
    last_name = trim(p_last_name),
    phone = trim(p_phone),
    email = trim(p_email),
    civic_number = trim(p_civic_number),
    address = trim(p_address),
    apartment = trim(p_apartment),
    city = trim(p_city),
    province = trim(p_province),
    postal_code = trim(p_postal_code),
    country = trim(p_country),
    broker = p_broker,
    client_type = p_client_type,
    priority = p_priority,
    status = p_status,
    last_contact_date = greatest(v_target.last_contact_date, v_source.last_contact_date, v_last_contact),
    next_follow_up_date = p_next_follow_up_date,
    google_calendar_event_id = p_google_event_id,
    google_calendar_event_broker = p_google_event_broker,
    google_calendar_sync_status = case when p_next_follow_up_date is null then 'synced' else 'pending' end,
    google_calendar_last_error = null
  where id = p_target_id
  returning * into v_result;

  insert into public.contact_merges (
    merged_into_contact_id,
    merged_from,
    merged_by_user_id
  ) values (
    p_target_id,
    to_jsonb(v_source),
    p_merged_by_user_id
  );

  delete from public.contacts where id = p_source_id;
  return v_result;
end;
$$;

create index if not exists contacts_broker_idx on public.contacts (broker);
create index if not exists contacts_next_follow_up_idx
  on public.contacts (next_follow_up_date) where next_follow_up_date is not null;
create index if not exists contacts_broker_follow_up_idx
  on public.contacts (broker, next_follow_up_date) where next_follow_up_date is not null;
create index if not exists contacts_broker_type_status_idx
  on public.contacts (broker, client_type, status);
create index if not exists contacts_email_lower_idx
  on public.contacts (lower(email)) where email <> '';
create index if not exists contacts_phone_idx
  on public.contacts (phone) where phone <> '';
create index if not exists contacts_first_name_trgm_idx
  on public.contacts using gin (first_name gin_trgm_ops);
create index if not exists contacts_last_name_trgm_idx
  on public.contacts using gin (last_name gin_trgm_ops);
create index if not exists contacts_phone_trgm_idx
  on public.contacts using gin (phone gin_trgm_ops);
create index if not exists contacts_email_trgm_idx
  on public.contacts using gin (email gin_trgm_ops);
create index if not exists contacts_civic_number_trgm_idx
  on public.contacts using gin (civic_number gin_trgm_ops);
create index if not exists contacts_address_trgm_idx
  on public.contacts using gin (address gin_trgm_ops);
create index if not exists contacts_city_trgm_idx
  on public.contacts using gin (city gin_trgm_ops);
create index if not exists contacts_postal_code_trgm_idx
  on public.contacts using gin (postal_code gin_trgm_ops);
create index if not exists client_notes_contact_created_idx
  on public.client_notes (contact_id, created_at desc);
create index if not exists client_notes_author_idx
  on public.client_notes (created_by_user_id)
  where created_by_user_id is not null;
create index if not exists contact_merges_target_idx
  on public.contact_merges (merged_into_contact_id, merged_at desc);
create index if not exists contacts_google_event_broker_idx
  on public.contacts (google_calendar_event_broker)
  where google_calendar_event_id is not null;
create index if not exists contacts_calendar_sync_status_idx
  on public.contacts (google_calendar_sync_status)
  where google_calendar_sync_status <> 'synced';
create index if not exists contacts_buyer_pipeline_idx
  on public.contacts (broker, buyer_pipeline_stage) where client_type in ('buyer', 'buyer_seller');
create index if not exists contacts_seller_pipeline_idx
  on public.contacts (broker, seller_pipeline_stage) where client_type in ('seller', 'buyer_seller');
create index if not exists pipeline_history_contact_idx
  on public.pipeline_history (contact_id, changed_at desc);
create index if not exists transactions_broker_status_idx
  on public.transactions (broker, status, updated_at desc);
create index if not exists transactions_address_trgm_idx
  on public.transactions using gin (address gin_trgm_ops);
create index if not exists transaction_contacts_contact_idx
  on public.transaction_contacts (contact_id, transaction_id);
create index if not exists transaction_deadlines_transaction_due_idx
  on public.transaction_deadlines (transaction_id, completed, due_date);
create index if not exists transaction_deadlines_google_event_idx
  on public.transaction_deadlines (google_calendar_event_broker)
  where google_calendar_event_id is not null;
create index if not exists transaction_notes_transaction_created_idx
  on public.transaction_notes (transaction_id, created_at desc);

alter table public.contacts enable row level security;
alter table public.client_notes enable row level security;
alter table public.google_calendar_connections enable row level security;
alter table public.contact_merges enable row level security;
alter table public.pipeline_history enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_contacts enable row level security;
alter table public.transaction_deadlines enable row level security;
alter table public.transaction_notes enable row level security;

-- Retire d'abord toutes les anciennes politiques publiques.
drop policy if exists "temporary anon contacts select" on public.contacts;
drop policy if exists "temporary anon contacts insert" on public.contacts;
drop policy if exists "temporary anon contacts update" on public.contacts;
drop policy if exists "temporary anon notes select" on public.client_notes;
drop policy if exists "temporary anon notes insert" on public.client_notes;
drop policy if exists "temporary anon notes update" on public.client_notes;

revoke all on public.contacts from anon, authenticated;
revoke all on public.client_notes from anon, authenticated;
revoke all on public.contact_merges from anon, authenticated;
revoke all on public.pipeline_history from anon, authenticated;
revoke all on public.transactions from anon, authenticated;
revoke all on public.transaction_contacts from anon, authenticated;
revoke all on public.transaction_deadlines from anon, authenticated;
revoke all on public.transaction_notes from anon, authenticated;
revoke execute on function public.assign_contacts(uuid[], public.broker_assignment) from public, anon;
revoke execute on function public.merge_contacts(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text,
  public.broker_assignment, public.client_type, public.contact_priority,
  public.contact_status, date, text, public.broker_assignment, uuid
) from public, anon, authenticated;

-- Les connexions Google restent exclusivement accessibles au serveur avec la clé service_role.
revoke all on public.google_calendar_connections from anon, authenticated;
revoke execute on function public.assign_contacts(uuid[], public.broker_assignment)
from authenticated;
grant select, insert, update, delete on public.google_calendar_connections to service_role;
grant select, insert, update, delete on public.contacts to service_role;
grant select, insert, update, delete on public.client_notes to service_role;
grant select, insert, update, delete on public.contact_merges to service_role;
grant select, insert, update, delete on public.pipeline_history to service_role;
grant select, insert, update, delete on public.transactions to service_role;
grant select, insert, update, delete on public.transaction_contacts to service_role;
grant select, insert, update, delete on public.transaction_deadlines to service_role;
grant select, insert, update, delete on public.transaction_notes to service_role;
grant usage on type public.broker_assignment to service_role;
grant usage on type public.calendar_sync_status to service_role;
grant usage on type public.client_type to service_role;
grant usage on type public.contact_priority to service_role;
grant usage on type public.contact_status to service_role;
grant execute on function public.merge_contacts(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text,
  public.broker_assignment, public.client_type, public.contact_priority,
  public.contact_status, date, text, public.broker_assignment, uuid
) to service_role;

-- Accès universel CRM : Supabase Auth n'est plus utilisé par l'application.
-- Les tables restent sous RLS, sans politique anon/authenticated; seul le
-- serveur, avec service_role, peut désormais lire ou modifier les données.
drop function if exists public.add_client_note(uuid, text);
drop function if exists public.update_pipeline_stage(uuid, text, text);
drop function if exists public.is_authorized_crm_user() cascade;
drop table if exists public.profiles cascade;
drop type if exists public.crm_role cascade;

drop policy if exists "authorized contacts select" on public.contacts;
drop policy if exists "authorized contacts insert" on public.contacts;
drop policy if exists "authorized contacts update" on public.contacts;
drop policy if exists "authorized notes select" on public.client_notes;
drop policy if exists "authorized notes insert" on public.client_notes;
drop policy if exists "authorized notes update" on public.client_notes;
drop policy if exists "authorized merge audit select" on public.contact_merges;
drop policy if exists "authorized pipeline history select" on public.pipeline_history;
drop policy if exists "authorized pipeline history insert" on public.pipeline_history;

revoke all on public.contacts from anon, authenticated;
revoke all on public.client_notes from anon, authenticated;
revoke all on public.contact_merges from anon, authenticated;
revoke all on public.pipeline_history from anon, authenticated;
revoke all on public.google_calendar_connections from anon, authenticated;
revoke all on public.transactions from anon, authenticated;
revoke all on public.transaction_contacts from anon, authenticated;
revoke all on public.transaction_deadlines from anon, authenticated;
revoke all on public.transaction_notes from anon, authenticated;

create or replace function public.update_pipeline_stage(
  p_contact_id uuid,
  p_pipeline_type text,
  p_to_stage text,
  p_changed_by public.broker_assignment
)
returns public.contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.contacts;
  v_from_stage text;
begin
  if p_changed_by = 'unassigned' then raise exception 'Courtier invalide'; end if;
  select * into v_contact from public.contacts where id = p_contact_id for update;
  if v_contact.id is null then raise exception 'Contact introuvable'; end if;

  if p_pipeline_type = 'buyer' then
    if v_contact.client_type not in ('buyer', 'buyer_seller')
      or not (p_to_stage = any (array['new', 'qualified', 'search', 'visits', 'offer', 'conditions', 'notary', 'purchased', 'long_term']))
    then raise exception 'Étape acheteur invalide'; end if;
    v_from_stage := v_contact.buyer_pipeline_stage;
    if v_from_stage = p_to_stage then return v_contact; end if;
    update public.contacts set buyer_pipeline_stage = p_to_stage where id = p_contact_id returning * into v_contact;
  elsif p_pipeline_type = 'seller' then
    if v_contact.client_type not in ('seller', 'buyer_seller')
      or not (p_to_stage = any (array['new', 'to_contact', 'evaluation', 'follow_up', 'contract_signed', 'on_market', 'offer_received', 'conditions', 'notary', 'sold', 'long_term']))
    then raise exception 'Étape vendeur invalide'; end if;
    v_from_stage := v_contact.seller_pipeline_stage;
    if v_from_stage = p_to_stage then return v_contact; end if;
    update public.contacts set seller_pipeline_stage = p_to_stage where id = p_contact_id returning * into v_contact;
  else
    raise exception 'Pipeline invalide';
  end if;

  insert into public.pipeline_history (
    contact_id, pipeline_type, from_stage, to_stage, changed_by_broker
  ) values (
    p_contact_id, p_pipeline_type, v_from_stage, p_to_stage, p_changed_by
  );
  return v_contact;
end;
$$;

revoke execute on function public.update_pipeline_stage(uuid, text, text, public.broker_assignment)
from public, anon, authenticated;
grant execute on function public.update_pipeline_stage(uuid, text, text, public.broker_assignment)
to service_role;
