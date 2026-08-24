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
  birth_date date,
  mortgage_renewal_date date,
  civic_number text not null default '',
  address text not null default '',
  apartment text not null default '',
  city text not null default '',
  province text not null default '',
  postal_code text not null default '',
  country text not null default '',
  broker public.broker_assignment not null default 'unassigned',
  client_type public.client_type,
  client_provenance text,
  priority public.contact_priority,
  status public.contact_status not null default 'active',
  source public.contact_source not null default 'manual',
  last_contact_date timestamptz,
  next_follow_up_date date,
  google_calendar_event_id text,
  google_calendar_event_broker public.broker_assignment,
  google_calendar_sync_status public.calendar_sync_status not null default 'synced',
  google_calendar_last_error text,
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
  constraint contacts_client_provenance_check check (
    client_provenance is null
    or client_provenance in ('friend_family', 'referral', 'prospecting', 'confia')
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
  add column if not exists birth_date date,
  add column if not exists mortgage_renewal_date date,
  add column if not exists client_provenance text,
  add column if not exists google_calendar_event_id text,
  add column if not exists google_calendar_event_broker public.broker_assignment,
  add column if not exists google_calendar_sync_status public.calendar_sync_status not null default 'synced',
  add column if not exists google_calendar_last_error text;

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
    add constraint contacts_client_provenance_check check (
      client_provenance is null
      or client_provenance in ('friend_family', 'referral', 'prospecting', 'confia')
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
  sold_price numeric(14, 2),
  notary_date date,
  collaborating_broker_name text not null default '',
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
  constraint listings_sold_price_check check (sold_price is null or sold_price >= 0),
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

alter table public.listings
  add column if not exists sold_price numeric(14, 2),
  add column if not exists notary_date date,
  add column if not exists collaborating_broker_name text not null default '';

do $$ begin
  alter table public.listings
    add constraint listings_sold_price_check
    check (sold_price is null or sold_price >= 0);
exception when duplicate_object then null;
end $$;

create table if not exists public.listing_contacts (
  listing_id uuid not null references public.listings(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (listing_id, contact_id),
  constraint listing_contacts_role_check check (role = 'owner')
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  address text not null check (length(trim(address)) > 0),
  centris_number text not null default '',
  type text not null check (type = any (array['purchase', 'sale'])),
  broker public.broker_assignment not null check (broker <> 'unassigned'),
  price numeric(14, 2),
  sold_price numeric(14, 2),
  promise_date date,
  notary_date date,
  collaborating_broker_name text not null default '',
  sale_finalized_at timestamptz,
  purchase_finalized_at timestamptz,
  status text not null default 'new' check (
    status = any (array[
      'new', 'pa_preparation', 'pa_sent', 'pa_accepted', 'inspection',
      'financing', 'other_conditions', 'conditions_met', 'notary',
      'completed', 'cancelled', 'on_market', 'offer_received', 'negotiation'
    ])
  ),
  general_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_sold_price_check check (sold_price is null or sold_price > 0)
);

alter table public.transactions
  add column if not exists sold_price numeric(14, 2),
  add column if not exists notary_date date,
  add column if not exists collaborating_broker_name text not null default '',
  add column if not exists sale_finalized_at timestamptz,
  add column if not exists purchase_finalized_at timestamptz;

do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and conname = 'transactions_sold_price_check'
  ) then
    alter table public.transactions
      add constraint transactions_sold_price_check
      check (sold_price is null or sold_price > 0);
  end if;
end $$;

do $$ begin
  if to_regclass('public.listing_transaction_links') is not null then
    alter table public.listing_transaction_links
      drop constraint if exists listing_transaction_links_listing_unique;
    create index if not exists listing_transaction_links_listing_idx
      on public.listing_transaction_links (listing_id);
  end if;
end $$;

create or replace function public.create_transaction_from_listing_offer(
  p_listing_id uuid,
  p_offer_id uuid,
  p_actor public.broker_assignment default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
  v_offer record;
  v_existing uuid;
  v_transaction_id uuid;
  v_address text;
begin
  if p_actor = 'unassigned' then p_actor := null; end if;

  select transaction_id into v_existing
  from public.listing_transaction_links
  where offer_id = p_offer_id;
  if found then return v_existing; end if;

  select * into v_listing
  from public.listings
  where id = p_listing_id
  for update;
  if not found then
    raise exception 'Listing introuvable' using errcode = 'P0001';
  end if;

  select * into v_offer
  from public.listing_offers
  where id = p_offer_id and listing_id = p_listing_id
  for update;
  if not found then
    raise exception 'Offre introuvable' using errcode = 'P0001';
  end if;
  if v_listing.purpose <> 'sale' or v_offer.purpose <> 'sale' then
    raise exception 'Seule une offre de vente peut créer une transaction' using errcode = 'P0001';
  end if;
  if v_offer.status <> 'accepted' then
    raise exception 'L’offre doit être acceptée' using errcode = 'P0001';
  end if;

  select l.transaction_id into v_existing
  from public.listing_transaction_links l
  join public.transactions t on t.id = l.transaction_id
  where l.listing_id = p_listing_id
    and t.status <> 'cancelled'
  order by l.created_at desc, l.transaction_id desc
  limit 1;
  if found then
    raise exception 'Ce Listing possède déjà une transaction active' using errcode = 'P0001';
  end if;

  v_address := concat_ws(', ',
    nullif(trim(concat_ws(' ', nullif(trim(v_listing.civic_number), ''), nullif(trim(v_listing.address), ''))), ''),
    case when trim(v_listing.apartment) <> '' then 'app. ' || trim(v_listing.apartment) end,
    nullif(trim(v_listing.city), ''),
    nullif(trim(concat_ws(' ', nullif(trim(v_listing.province), ''), nullif(trim(v_listing.postal_code), ''))), ''),
    nullif(trim(v_listing.country), '')
  );

  insert into public.transactions (
    address, centris_number, type, broker, price, promise_date, status, general_notes
  ) values (
    v_address, v_listing.centris_number, 'sale', v_listing.broker, v_offer.amount,
    v_offer.offer_date, 'pa_accepted',
    'Créée depuis le Listing ' || v_address || E'\nMontant accepté : ' || v_offer.amount::text
      || case when trim(v_offer.buyer_names) <> '' then E'\nAcheteurs : ' || trim(v_offer.buyer_names) else '' end
  ) returning id into v_transaction_id;

  insert into public.transaction_contacts (transaction_id, contact_id)
  select v_transaction_id, contact_id
  from public.listing_contacts
  where listing_id = p_listing_id and role = 'owner'
  on conflict do nothing;

  insert into public.listing_transaction_links (listing_id, offer_id, transaction_id)
  values (p_listing_id, p_offer_id, v_transaction_id);

  insert into public.listing_activity (listing_id, event_type, title, detail, actor_broker, metadata)
  values (
    p_listing_id,
    'transaction_created',
    'Transaction créée depuis l’offre acceptée',
    v_offer.amount::text,
    p_actor,
    jsonb_build_object('offerId', p_offer_id, 'transactionId', v_transaction_id)
  );

  return v_transaction_id;
end;
$$;

create or replace function public.return_listing_transaction_to_market(
  p_transaction_id uuid,
  p_actor_broker public.broker_assignment default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions;
  v_listing public.listings;
  v_link record;
begin
  if p_actor_broker = 'unassigned' then p_actor_broker := null; end if;

  select * into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;
  if not found then
    raise exception 'Transaction introuvable.' using errcode = 'P0001';
  end if;
  if v_transaction.type <> 'sale' then
    raise exception 'Seule une Transaction de vente peut revenir sur le marché.' using errcode = 'P0001';
  end if;
  if v_transaction.sale_finalized_at is not null then
    raise exception 'Une vente finalisée ne peut pas revenir sur le marché.' using errcode = 'P0001';
  end if;
  if v_transaction.status = 'cancelled' then
    raise exception 'Cette Transaction est déjà annulée.' using errcode = 'P0001';
  end if;

  select * into v_link
  from public.listing_transaction_links
  where transaction_id = p_transaction_id;
  if not found then
    raise exception 'Cette Transaction ne provient pas d’un Listing.' using errcode = 'P0001';
  end if;

  select * into v_listing
  from public.listings
  where id = v_link.listing_id
  for update;
  if not found then
    raise exception 'Listing introuvable.' using errcode = 'P0001';
  end if;
  if v_listing.status = 'sold' then
    raise exception 'Un Listing vendu ne peut pas revenir sur le marché.' using errcode = 'P0001';
  end if;

  update public.transactions
  set status = 'cancelled'
  where id = p_transaction_id;

  update public.listings
  set status = 'active'
  where id = v_link.listing_id;

  insert into public.listing_activity (
    listing_id, event_type, title, detail, actor_broker, metadata
  ) values (
    v_link.listing_id,
    'returned_to_market',
    'Retour sur le marché',
    'Transaction annulée · propriété remise en marché',
    p_actor_broker,
    jsonb_build_object('transactionId', p_transaction_id, 'offerId', v_link.offer_id)
  );

  return jsonb_build_object(
    'transactionId', p_transaction_id,
    'listingId', v_link.listing_id,
    'offerId', v_link.offer_id
  );
end;
$$;

create or replace function public.complete_transaction_sale(
  p_transaction_id uuid,
  p_sold_price numeric,
  p_notary_date date,
  p_collaborating_broker_name text,
  p_no_collaborating_broker boolean
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions;
  v_collaborating_broker_name text;
begin
  select * into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction introuvable.' using errcode = 'P0001';
  end if;
  if v_transaction.type <> 'sale' then
    raise exception 'Seule une Transaction de vente peut être finalisée comme vendue.' using errcode = 'P0001';
  end if;
  if v_transaction.sale_finalized_at is not null then
    raise exception 'Cette vente est déjà finalisée.' using errcode = 'P0001';
  end if;
  if p_sold_price is null or p_sold_price <= 0 then
    raise exception 'Prix vendu invalide.' using errcode = 'P0001';
  end if;
  if p_notary_date is null then
    raise exception 'Date du notaire requise.' using errcode = 'P0001';
  end if;
  if p_no_collaborating_broker is null then
    raise exception 'Choix du courtier collaborateur requis.' using errcode = 'P0001';
  end if;

  v_collaborating_broker_name := trim(coalesce(p_collaborating_broker_name, ''));
  if not p_no_collaborating_broker and v_collaborating_broker_name = '' then
    raise exception 'Courtier collaborateur requis.' using errcode = 'P0001';
  end if;
  if length(v_collaborating_broker_name) > 240 then
    raise exception 'Courtier collaborateur invalide.' using errcode = 'P0001';
  end if;
  if p_no_collaborating_broker then
    v_collaborating_broker_name := '';
  end if;

  update public.transactions
  set
    sold_price = p_sold_price,
    notary_date = p_notary_date,
    collaborating_broker_name = v_collaborating_broker_name,
    sale_finalized_at = now()
  where id = p_transaction_id
  returning * into v_transaction;

  return v_transaction;
end;
$$;

drop function if exists public.complete_transaction_purchase(uuid, numeric, date);

create or replace function public.complete_transaction_purchase(
  p_transaction_id uuid,
  p_purchase_price numeric,
  p_notary_date date,
  p_collaborating_broker_name text
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions;
begin
  select * into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction introuvable.' using errcode = 'P0001';
  end if;
  if v_transaction.type <> 'purchase' then
    raise exception 'Seule une Transaction d''achat peut être finalisée.' using errcode = 'P0001';
  end if;
  if v_transaction.status = 'cancelled' then
    raise exception 'Une Transaction annulée ne peut pas être finalisée.' using errcode = 'P0001';
  end if;
  if v_transaction.purchase_finalized_at is not null then
    raise exception 'Cet achat est déjà finalisé.' using errcode = 'P0001';
  end if;
  if p_purchase_price is null or p_purchase_price <= 0 then
    raise exception 'Prix d''achat final invalide.' using errcode = 'P0001';
  end if;
  if p_notary_date is null then
    raise exception 'Date du notaire requise.' using errcode = 'P0001';
  end if;
  if p_collaborating_broker_name is null or char_length(trim(p_collaborating_broker_name)) > 240 then
    raise exception 'Courtier collaborateur invalide.' using errcode = 'P0001';
  end if;

  update public.transactions
  set
    price = p_purchase_price,
    notary_date = p_notary_date,
    collaborating_broker_name = trim(p_collaborating_broker_name),
    purchase_finalized_at = now()
  where id = p_transaction_id
  returning * into v_transaction;

  return v_transaction;
end;
$$;

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

create table if not exists public.google_calendar_watch_channels (
  broker public.broker_assignment primary key,
  calendar_id text not null default 'primary',
  channel_id text not null unique,
  resource_id text,
  token_hash text not null,
  expires_at timestamptz,
  change_version bigint not null default 0,
  last_notification_at timestamptz,
  last_resource_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_watch_channels_assigned_broker_check
    check (broker <> 'unassigned'),
  constraint google_calendar_watch_channels_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.crm_recommendations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  submitted_by public.broker_assignment not null,
  status text not null default 'unread',
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  opened_by public.broker_assignment,
  constraint crm_recommendations_title_length_check
    check (length(trim(title)) between 1 and 120),
  constraint crm_recommendations_content_length_check
    check (length(trim(content)) between 1 and 4000),
  constraint crm_recommendations_submitted_by_check
    check (submitted_by <> 'unassigned'),
  constraint crm_recommendations_status_check
    check (status = any (array['unread', 'read'])),
  constraint crm_recommendations_opened_by_check
    check (opened_by is null or opened_by <> 'unassigned')
);

create table if not exists public.automatic_email_rules (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null,
  name text not null,
  status text not null default 'draft',
  execution_mode text not null default 'approval',
  default_broker public.broker_assignment,
  subject_template text not null default '',
  body_template text not null default '',
  send_hour integer not null default 9,
  send_minute integer not null default 0,
  timezone text not null default 'America/Toronto',
  trigger_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automatic_email_rules_rule_type_check
    check (rule_type = any (array['birthday', 'mortgage_renewal', 'purchase_anniversary', 'google_review'])),
  constraint automatic_email_rules_rule_type_unique unique (rule_type),
  constraint automatic_email_rules_name_check check (length(trim(name)) between 1 and 120),
  constraint automatic_email_rules_status_check check (status = any (array['draft', 'ready', 'paused'])),
  constraint automatic_email_rules_execution_mode_check check (execution_mode = any (array['automatic', 'approval'])),
  constraint automatic_email_rules_default_broker_check check (default_broker is null or default_broker <> 'unassigned'),
  constraint automatic_email_rules_subject_length_check check (length(subject_template) <= 250),
  constraint automatic_email_rules_body_length_check check (length(body_template) <= 100000),
  constraint automatic_email_rules_send_hour_check check (send_hour between 0 and 23),
  constraint automatic_email_rules_send_minute_check check (send_minute between 0 and 59),
  constraint automatic_email_rules_timezone_check check (timezone = 'America/Toronto'),
  constraint automatic_email_rules_trigger_config_check check (jsonb_typeof(trigger_config) = 'object'),
  constraint automatic_email_rules_ready_configuration_check check (
    status <> 'ready'
    or (
      default_broker is not null
      and length(trim(subject_template)) > 0
      and length(trim(body_template)) > 0
      and (rule_type <> 'google_review' or length(trim(coalesce(trigger_config->>'googleReviewUrl', ''))) > 0)
    )
  )
);

create table if not exists public.automatic_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.automatic_email_rules(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  broker public.broker_assignment not null,
  recipient_email text not null,
  occurrence_key text not null,
  scheduled_for timestamptz not null,
  status text not null default 'preview',
  gmail_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automatic_email_deliveries_broker_check check (broker <> 'unassigned'),
  constraint automatic_email_deliveries_recipient_check check (length(trim(recipient_email)) between 3 and 320),
  constraint automatic_email_deliveries_occurrence_key_check check (length(trim(occurrence_key)) between 1 and 500),
  constraint automatic_email_deliveries_status_check check (status = any (array['preview', 'queued', 'cancelled'])),
  constraint automatic_email_deliveries_no_delivery_metadata_check check (gmail_message_id is null and error_message is null),
  constraint automatic_email_deliveries_rule_occurrence_unique unique (rule_id, occurrence_key)
);

create table if not exists public.custom_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft',
  execution_mode text not null default 'approval',
  sender_strategy text not null default 'assigned_broker',
  fixed_broker public.broker_assignment,
  fallback_broker public.broker_assignment,
  start_date date,
  send_hour integer not null default 9,
  send_minute integer not null default 0,
  timezone text not null default 'America/Toronto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_email_campaigns_name_check check (length(trim(name)) between 1 and 160),
  constraint custom_email_campaigns_status_check check (status = any (array['draft', 'ready', 'paused'])),
  constraint custom_email_campaigns_execution_mode_check check (execution_mode = any (array['approval', 'automatic'])),
  constraint custom_email_campaigns_sender_strategy_check check (sender_strategy = any (array['assigned_broker', 'fixed_broker'])),
  constraint custom_email_campaigns_fixed_broker_check check (fixed_broker is null or fixed_broker <> 'unassigned'),
  constraint custom_email_campaigns_fallback_broker_check check (fallback_broker is null or fallback_broker <> 'unassigned'),
  constraint custom_email_campaigns_send_hour_check check (send_hour between 0 and 23),
  constraint custom_email_campaigns_send_minute_check check (send_minute between 0 and 59),
  constraint custom_email_campaigns_timezone_check check (timezone = 'America/Toronto'),
  constraint custom_email_campaigns_ready_configuration_check check (
    status <> 'ready'
    or (
      start_date is not null
      and (
        (sender_strategy = 'assigned_broker' and fallback_broker is not null)
        or (sender_strategy = 'fixed_broker' and fixed_broker is not null)
      )
    )
  )
);

create table if not exists public.custom_email_campaign_contacts (
  campaign_id uuid not null references public.custom_email_campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, contact_id)
);

create table if not exists public.custom_email_campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.custom_email_campaigns(id) on delete cascade,
  step_order integer not null,
  delay_days_after_previous integer not null default 0,
  subject_template text not null default '',
  body_template text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_email_campaign_steps_order_check check (step_order >= 1),
  constraint custom_email_campaign_steps_delay_check check (delay_days_after_previous between 0 and 3650),
  constraint custom_email_campaign_steps_subject_length_check check (length(subject_template) <= 250),
  constraint custom_email_campaign_steps_body_length_check check (length(body_template) <= 100000),
  constraint custom_email_campaign_steps_campaign_order_unique unique (campaign_id, step_order)
);

create table if not exists public.contact_birthday_calendar_events (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  broker public.broker_assignment not null check (broker <> 'unassigned'),
  google_calendar_event_id text,
  synced_birth_date date,
  sync_status public.calendar_sync_status not null default 'pending',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (contact_id, broker)
);

create table if not exists public.contact_mortgage_renewal_calendar_events (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  broker public.broker_assignment not null check (broker <> 'unassigned'),
  google_calendar_event_id text,
  synced_mortgage_renewal_date date,
  sync_status public.calendar_sync_status not null default 'pending',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (contact_id, broker)
);

create index if not exists contact_birthday_events_broker_idx on public.contact_birthday_calendar_events(broker);
create index if not exists contact_birthday_events_status_idx on public.contact_birthday_calendar_events(sync_status);
create index if not exists contact_birthday_events_broker_status_idx on public.contact_birthday_calendar_events(broker, sync_status);
create index if not exists contact_mortgage_renewal_events_broker_idx on public.contact_mortgage_renewal_calendar_events(broker);
create index if not exists contact_mortgage_renewal_events_status_idx on public.contact_mortgage_renewal_calendar_events(sync_status);
create index if not exists contact_mortgage_renewal_events_broker_status_idx on public.contact_mortgage_renewal_calendar_events(broker, sync_status);
create index if not exists contacts_mortgage_renewal_date_idx on public.contacts(mortgage_renewal_date) where mortgage_renewal_date is not null;
create index if not exists crm_recommendations_created_at_idx
  on public.crm_recommendations (created_at desc);
create index if not exists crm_recommendations_status_created_idx
  on public.crm_recommendations (status, created_at desc);
create index if not exists automatic_email_deliveries_scheduled_idx
  on public.automatic_email_deliveries (scheduled_for, status);
create index if not exists automatic_email_deliveries_contact_idx
  on public.automatic_email_deliveries (contact_id, scheduled_for desc)
  where contact_id is not null;
create index if not exists automatic_email_deliveries_transaction_idx
  on public.automatic_email_deliveries (transaction_id, scheduled_for desc)
  where transaction_id is not null;
create index if not exists custom_email_campaigns_start_status_idx
  on public.custom_email_campaigns (start_date, status);
create index if not exists custom_email_campaign_contacts_campaign_idx
  on public.custom_email_campaign_contacts (campaign_id);
create index if not exists custom_email_campaign_steps_campaign_order_idx
  on public.custom_email_campaign_steps (campaign_id, step_order);

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

create or replace function public.notify_google_calendar_change(
  p_channel_id text,
  p_resource_id text,
  p_resource_state text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change_version bigint;
begin
  if p_resource_state not in ('sync', 'exists', 'not_exists') then
    return null;
  end if;

  update public.google_calendar_watch_channels
  set
    resource_id = case
      when resource_id is null and p_resource_state = 'sync' then p_resource_id
      else resource_id
    end,
    change_version = change_version + case
      when p_resource_state in ('exists', 'not_exists') then 1
      else 0
    end,
    last_notification_at = now(),
    last_resource_state = p_resource_state
  where channel_id = p_channel_id
    and (
      resource_id = p_resource_id
      or (resource_id is null and p_resource_state = 'sync')
    )
  returning change_version into v_change_version;

  return v_change_version;
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

drop trigger if exists listings_set_updated_at on public.listings;
create trigger listings_set_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

drop trigger if exists automatic_email_rules_set_updated_at on public.automatic_email_rules;
create trigger automatic_email_rules_set_updated_at
before update on public.automatic_email_rules
for each row execute function public.set_updated_at();

drop trigger if exists automatic_email_deliveries_set_updated_at on public.automatic_email_deliveries;
create trigger automatic_email_deliveries_set_updated_at
before update on public.automatic_email_deliveries
for each row execute function public.set_updated_at();

drop trigger if exists custom_email_campaigns_set_updated_at on public.custom_email_campaigns;
create trigger custom_email_campaigns_set_updated_at
before update on public.custom_email_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists custom_email_campaign_steps_set_updated_at on public.custom_email_campaign_steps;
create trigger custom_email_campaign_steps_set_updated_at
before update on public.custom_email_campaign_steps
for each row execute function public.set_updated_at();

insert into public.automatic_email_rules (
  rule_type, name, status, execution_mode, default_broker,
  subject_template, body_template, send_hour, send_minute, timezone, trigger_config
)
values
  ('birthday', 'Bonne fête', 'draft', 'approval', null, 'Bonne fête {{firstName}}! 🎉', E'Bonjour {{firstName}},\n\nToute l''Équipe Forbes te souhaite une très belle journée et une excellente année à venir!', 9, 0, 'America/Toronto', '{}'::jsonb),
  ('mortgage_renewal', 'Renouvellement hypothécaire', 'draft', 'approval', null, 'Votre renouvellement hypothécaire approche', E'Bonjour {{firstName}},\n\nVotre renouvellement hypothécaire du {{mortgageRenewalDate}} approche. Souhaitez-vous faire le point sur vos projets immobiliers?', 9, 0, 'America/Toronto', '{"leadMonths": 6}'::jsonb),
  ('purchase_anniversary', 'Anniversaire d’achat', 'draft', 'approval', null, 'Un anniversaire immobilier à souligner', E'Bonjour {{firstName}},\n\nNous tenions à souligner l''anniversaire de votre achat conclu le {{purchaseDate}}. Nous espérons que vous profitez pleinement de votre propriété!', 9, 0, 'America/Toronto', '{}'::jsonb),
  ('google_review', 'Demande d’avis Google', 'draft', 'approval', null, 'Votre avis compte pour nous', E'Bonjour {{firstName}},\n\nMerci de nous avoir fait confiance. Si vous le souhaitez, vous pouvez partager votre expérience ici : {{googleReviewUrl}}', 9, 0, 'America/Toronto', '{"delayDays": 3}'::jsonb)
on conflict (rule_type) do nothing;

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

drop trigger if exists transaction_deadlines_set_updated_at on public.transaction_deadlines;
create trigger transaction_deadlines_set_updated_at
before update on public.transaction_deadlines
for each row execute function public.set_updated_at();

drop trigger if exists google_calendar_connections_set_updated_at on public.google_calendar_connections;
create trigger google_calendar_connections_set_updated_at
before update on public.google_calendar_connections
for each row execute function public.set_updated_at();

drop trigger if exists google_calendar_watch_channels_set_updated_at on public.google_calendar_watch_channels;
create trigger google_calendar_watch_channels_set_updated_at
before update on public.google_calendar_watch_channels
for each row execute function public.set_updated_at();

drop trigger if exists set_contact_birthday_calendar_events_updated_at on public.contact_birthday_calendar_events;
create trigger set_contact_birthday_calendar_events_updated_at
before update on public.contact_birthday_calendar_events
for each row execute function public.set_updated_at();

drop trigger if exists set_contact_mortgage_renewal_calendar_events_updated_at on public.contact_mortgage_renewal_calendar_events;
create trigger set_contact_mortgage_renewal_calendar_events_updated_at
before update on public.contact_mortgage_renewal_calendar_events
for each row execute function public.set_updated_at();

create or replace function public.queue_contact_birthday_calendar_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.birth_date is not null)
     or (tg_op = 'UPDATE' and new.birth_date is distinct from old.birth_date) then
    insert into public.contact_birthday_calendar_events(contact_id,broker,sync_status,last_error)
    select new.id, broker, 'pending'::public.calendar_sync_status, null
    from unnest(array['france','maxime','sandrine']::public.broker_assignment[]) as brokers(broker)
    on conflict(contact_id,broker) do update set sync_status='pending',last_error=null,updated_at=now();
  end if;
  return new;
end;
$$;

drop trigger if exists queue_contact_birthdays on public.contacts;
create trigger queue_contact_birthdays after insert or update of birth_date on public.contacts
for each row execute function public.queue_contact_birthday_calendar_events();

create or replace function public.queue_contact_mortgage_renewal_calendar_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and new.mortgage_renewal_date is not null)
     or (tg_op = 'UPDATE' and new.mortgage_renewal_date is distinct from old.mortgage_renewal_date) then
    insert into public.contact_mortgage_renewal_calendar_events(contact_id,broker,sync_status,last_error)
    select new.id, broker, 'pending'::public.calendar_sync_status, null
    from unnest(array['france','maxime','sandrine']::public.broker_assignment[]) as brokers(broker)
    on conflict(contact_id,broker) do update set sync_status='pending',last_error=null,updated_at=now();
  end if;
  return new;
end;
$$;

drop trigger if exists queue_contact_mortgage_renewals on public.contacts;
create trigger queue_contact_mortgage_renewals after insert or update of mortgage_renewal_date on public.contacts
for each row execute function public.queue_contact_mortgage_renewal_calendar_events();

create or replace function public.enrich_contact_birth_dates(p_updates jsonb)
returns setof public.contacts language sql security definer set search_path = public as $$
  update public.contacts as contacts set birth_date=updates.birth_date
  from (
    select (item->>'contactId')::uuid as contact_id, nullif(item->>'birthDate','')::date as birth_date
    from jsonb_array_elements(coalesce(p_updates,'[]'::jsonb)) as items(item)
  ) as updates
  where contacts.id=updates.contact_id and contacts.birth_date is null and updates.birth_date is not null
  returning contacts.*;
$$;

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

create or replace function public.merge_draft_into_contact_with_addresses(
  p_target_id uuid, p_values jsonb, p_addresses jsonb, p_incoming_draft jsonb, p_merged_by_user_id uuid
)
returns public.contacts language plpgsql security definer set search_path = public, extensions as $$
declare v_result public.contacts;
begin
  perform 1 from public.contacts where id=p_target_id for update;
  if not found then raise exception 'Contact introuvable'; end if;
  update public.contacts set
    first_name=trim(coalesce(p_values->>'firstName','')), last_name=trim(coalesce(p_values->>'lastName','')),
    phone=trim(coalesce(p_values->>'phone','')), email=trim(coalesce(p_values->>'email','')),
    birth_date=nullif(p_values->>'birthDate','')::date,
    mortgage_renewal_date=nullif(p_values->>'mortgageRenewalDate','')::date,
    broker=(p_values->>'broker')::public.broker_assignment,
    next_follow_up_date=nullif(p_values->>'nextFollowUpDate','')::date,
    google_calendar_sync_status=case when nullif(p_values->>'nextFollowUpDate','') is null then google_calendar_sync_status else 'pending' end,
    google_calendar_last_error=null
  where id=p_target_id;
  select * into v_result from public.save_contact_addresses(p_target_id, p_addresses);
  insert into public.contact_merges(merged_into_contact_id,merged_from,merged_by_user_id)
  values(p_target_id,p_incoming_draft,p_merged_by_user_id);
  return v_result;
end;
$$;

create or replace function public.merge_contacts_with_contact_dates(
  p_target_id uuid, p_source_id uuid, p_addresses jsonb,
  p_first_name text, p_last_name text, p_phone text, p_email text,
  p_birth_date date, p_mortgage_renewal_date date,
  p_civic_number text, p_address text, p_apartment text, p_city text, p_province text, p_postal_code text, p_country text,
  p_broker public.broker_assignment, p_client_type public.client_type, p_priority public.contact_priority, p_status public.contact_status,
  p_next_follow_up_date date, p_google_event_id text, p_google_event_broker public.broker_assignment, p_merged_by_user_id uuid
)
returns public.contacts language plpgsql security definer set search_path = public, extensions as $$
declare v_result public.contacts;
begin
  select * into v_result from public.merge_contacts_with_birthdays(
    p_target_id,p_source_id,p_addresses,p_first_name,p_last_name,p_phone,p_email,p_birth_date,
    p_civic_number,p_address,p_apartment,p_city,p_province,p_postal_code,p_country,
    p_broker,p_client_type,p_priority,p_status,p_next_follow_up_date,p_google_event_id,p_google_event_broker,p_merged_by_user_id
  );
  update public.contacts set mortgage_renewal_date=p_mortgage_renewal_date
  where id=p_target_id returning * into v_result;
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
create index if not exists transactions_broker_status_idx
  on public.transactions (broker, status, updated_at desc);
create index if not exists transactions_address_trgm_idx
  on public.transactions using gin (address gin_trgm_ops);
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
alter table public.google_calendar_watch_channels enable row level security;
alter table public.contact_birthday_calendar_events enable row level security;
alter table public.contact_mortgage_renewal_calendar_events enable row level security;
alter table public.contact_merges enable row level security;
alter table public.listings enable row level security;
alter table public.listing_contacts enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_contacts enable row level security;
alter table public.transaction_deadlines enable row level security;
alter table public.transaction_notes enable row level security;
alter table public.crm_recommendations enable row level security;
alter table public.automatic_email_rules enable row level security;
alter table public.automatic_email_deliveries enable row level security;
alter table public.custom_email_campaigns enable row level security;
alter table public.custom_email_campaign_contacts enable row level security;
alter table public.custom_email_campaign_steps enable row level security;

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
revoke all on public.listings from public, anon, authenticated;
revoke all on public.listing_contacts from public, anon, authenticated;
revoke execute on function public.create_listing_with_owners(jsonb, uuid[]) from public, anon, authenticated;
revoke execute on function public.update_listing_with_owners(uuid, jsonb, uuid[]) from public, anon, authenticated;
revoke all on public.transactions from anon, authenticated;
revoke all on public.transaction_contacts from anon, authenticated;
revoke all on public.transaction_deadlines from anon, authenticated;
revoke all on public.transaction_notes from anon, authenticated;
revoke all on public.crm_recommendations from public, anon, authenticated;
revoke all on public.automatic_email_rules from public, anon, authenticated;
revoke all on public.automatic_email_deliveries from public, anon, authenticated;
revoke all on public.custom_email_campaigns from public, anon, authenticated;
revoke all on public.custom_email_campaign_contacts from public, anon, authenticated;
revoke all on public.custom_email_campaign_steps from public, anon, authenticated;
revoke execute on function public.assign_contacts(uuid[], public.broker_assignment) from public, anon;
revoke execute on function public.merge_contacts(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text,
  public.broker_assignment, public.client_type, public.contact_priority,
  public.contact_status, date, text, public.broker_assignment, uuid
) from public, anon, authenticated;

-- Les connexions Google restent exclusivement accessibles au serveur avec la clé service_role.
revoke all on public.google_calendar_connections from anon, authenticated;
revoke all on public.google_calendar_watch_channels from public, anon, authenticated;
revoke all on public.contact_birthday_calendar_events from public, anon, authenticated;
revoke all on public.contact_mortgage_renewal_calendar_events from public, anon, authenticated;
revoke execute on function public.queue_contact_mortgage_renewal_calendar_events() from public, anon, authenticated;
revoke execute on function public.merge_contacts_with_contact_dates(
  uuid,uuid,jsonb,text,text,text,text,date,date,text,text,text,text,text,text,text,
  public.broker_assignment,public.client_type,public.contact_priority,public.contact_status,date,text,public.broker_assignment,uuid
) from public,anon,authenticated;
revoke execute on function public.assign_contacts(uuid[], public.broker_assignment)
from authenticated;
grant select, insert, update, delete on public.google_calendar_connections to service_role;
grant select, insert, update, delete on public.google_calendar_watch_channels to service_role;
revoke execute on function public.notify_google_calendar_change(text, text, text) from public, anon, authenticated;
grant execute on function public.notify_google_calendar_change(text, text, text) to service_role;
grant select, insert, update, delete on public.contact_birthday_calendar_events to service_role;
grant select, insert, update, delete on public.contact_mortgage_renewal_calendar_events to service_role;
grant execute on function public.merge_contacts_with_contact_dates(
  uuid,uuid,jsonb,text,text,text,text,date,date,text,text,text,text,text,text,text,
  public.broker_assignment,public.client_type,public.contact_priority,public.contact_status,date,text,public.broker_assignment,uuid
) to service_role;
revoke execute on function public.enrich_contact_birth_dates(jsonb) from public, anon, authenticated;
grant execute on function public.enrich_contact_birth_dates(jsonb) to service_role;
grant select, insert, update, delete on public.contacts to service_role;
grant select, insert, update, delete on public.client_notes to service_role;
grant select, insert, update, delete on public.contact_merges to service_role;
grant select, insert, update, delete on public.listings to service_role;
grant select, insert, update, delete on public.listing_contacts to service_role;
grant execute on function public.create_listing_with_owners(jsonb, uuid[]) to service_role;
grant execute on function public.update_listing_with_owners(uuid, jsonb, uuid[]) to service_role;
grant select, insert, update, delete on public.transactions to service_role;
revoke execute on function public.complete_transaction_sale(
  uuid, numeric, date, text, boolean
) from public, anon, authenticated;
grant execute on function public.complete_transaction_sale(
  uuid, numeric, date, text, boolean
) to service_role;
revoke execute on function public.complete_transaction_purchase(
  uuid, numeric, date, text
) from public, anon, authenticated;
grant execute on function public.complete_transaction_purchase(
  uuid, numeric, date, text
) to service_role;
revoke execute on function public.create_transaction_from_listing_offer(
  uuid, uuid, public.broker_assignment
) from public, anon, authenticated;
grant execute on function public.create_transaction_from_listing_offer(
  uuid, uuid, public.broker_assignment
) to service_role;
revoke execute on function public.return_listing_transaction_to_market(
  uuid, public.broker_assignment
) from public, anon, authenticated;
grant execute on function public.return_listing_transaction_to_market(
  uuid, public.broker_assignment
) to service_role;
grant select, insert, update, delete on public.transaction_contacts to service_role;
grant select, insert, update, delete on public.transaction_deadlines to service_role;
grant select, insert, update, delete on public.transaction_notes to service_role;
grant select, insert, update, delete on public.crm_recommendations to service_role;
grant select, insert, update on public.automatic_email_rules to service_role;
grant select, insert, update on public.automatic_email_deliveries to service_role;
grant select, insert, update, delete on public.custom_email_campaigns to service_role;
grant select, insert, update, delete on public.custom_email_campaign_contacts to service_role;
grant select, insert, update, delete on public.custom_email_campaign_steps to service_role;
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

revoke all on public.contacts from anon, authenticated;
revoke all on public.client_notes from anon, authenticated;
revoke all on public.contact_merges from anon, authenticated;
revoke all on public.google_calendar_connections from anon, authenticated;
revoke all on public.listings from public, anon, authenticated;
revoke all on public.listing_contacts from public, anon, authenticated;
revoke all on public.transactions from anon, authenticated;
revoke all on public.transaction_contacts from anon, authenticated;
revoke all on public.transaction_deadlines from anon, authenticated;
revoke all on public.transaction_notes from anon, authenticated;
