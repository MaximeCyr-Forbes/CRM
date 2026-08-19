begin;

create table public.listing_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  purpose text not null,
  offer_date date not null,
  amount numeric(14, 2) not null,
  status text not null default 'received',
  buyer_names text not null default '',
  collaborating_broker_name text not null default '',
  collaborating_broker_agency text not null default '',
  notes text not null default '',
  accepted_at timestamptz,
  created_by public.broker_assignment,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_offers_purpose_check check (purpose = any (array['sale', 'rental'])),
  constraint listing_offers_amount_check check (amount >= 0),
  constraint listing_offers_status_check check (status = any (array[
    'received', 'negotiating', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired'
  ])),
  constraint listing_offers_created_by_check check (created_by is null or created_by <> 'unassigned')
);

create table public.listing_transaction_links (
  listing_id uuid not null references public.listings(id) on delete cascade,
  offer_id uuid not null references public.listing_offers(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint listing_transaction_links_listing_unique unique (listing_id),
  constraint listing_transaction_links_offer_unique unique (offer_id),
  constraint listing_transaction_links_transaction_unique unique (transaction_id)
);

create index listing_offers_listing_date_idx
  on public.listing_offers (listing_id, offer_date desc, created_at desc);
create index listing_offers_listing_status_idx
  on public.listing_offers (listing_id, status);
create index listing_transaction_links_transaction_idx
  on public.listing_transaction_links (transaction_id);

create trigger listing_offers_set_updated_at
before update on public.listing_offers
for each row execute function public.set_updated_at();

create or replace function public.create_listing_offer(
  p_listing_id uuid,
  p_values jsonb,
  p_actor public.broker_assignment default null
)
returns public.listing_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
  v_offer public.listing_offers;
begin
  if p_actor = 'unassigned' then p_actor := null; end if;
  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing introuvable' using errcode = 'P0001'; end if;

  insert into public.listing_offers (
    listing_id, purpose, offer_date, amount, status, buyer_names,
    collaborating_broker_name, collaborating_broker_agency, notes, accepted_at, created_by
  ) values (
    p_listing_id, v_listing.purpose, (p_values->>'offerDate')::date,
    (p_values->>'amount')::numeric, p_values->>'status',
    trim(coalesce(p_values->>'buyerNames', '')),
    trim(coalesce(p_values->>'collaboratingBrokerName', '')),
    trim(coalesce(p_values->>'collaboratingBrokerAgency', '')),
    trim(coalesce(p_values->>'notes', '')),
    case when p_values->>'status' = 'accepted' then now() else null end,
    p_actor
  ) returning * into v_offer;

  if v_listing.status = 'active' then
    update public.listings
    set status = case when v_offer.status = 'accepted' then 'conditional' else 'offer_received' end
    where id = p_listing_id;
  elsif v_listing.status = 'offer_received' and v_offer.status = 'accepted' then
    update public.listings set status = 'conditional' where id = p_listing_id;
  end if;

  insert into public.listing_activity (listing_id, event_type, title, detail, actor_broker, metadata)
  values (p_listing_id, 'offer_added', 'Offre reçue', v_offer.amount::text, p_actor,
    jsonb_build_object('offerId', v_offer.id, 'status', v_offer.status, 'amount', v_offer.amount));
  return v_offer;
end;
$$;

create or replace function public.update_listing_offer(
  p_listing_id uuid,
  p_offer_id uuid,
  p_values jsonb,
  p_actor public.broker_assignment default null
)
returns public.listing_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
  v_before public.listing_offers;
  v_offer public.listing_offers;
begin
  if p_actor = 'unassigned' then p_actor := null; end if;
  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing introuvable' using errcode = 'P0001'; end if;
  select * into v_before from public.listing_offers
  where id = p_offer_id and listing_id = p_listing_id for update;
  if not found then raise exception 'Offre introuvable' using errcode = 'P0001'; end if;

  update public.listing_offers set
    offer_date = (p_values->>'offerDate')::date,
    amount = (p_values->>'amount')::numeric,
    status = p_values->>'status',
    buyer_names = trim(coalesce(p_values->>'buyerNames', '')),
    collaborating_broker_name = trim(coalesce(p_values->>'collaboratingBrokerName', '')),
    collaborating_broker_agency = trim(coalesce(p_values->>'collaboratingBrokerAgency', '')),
    notes = trim(coalesce(p_values->>'notes', '')),
    accepted_at = case
      when accepted_at is not null then accepted_at
      when p_values->>'status' = 'accepted' then now()
      else null
    end
  where id = p_offer_id and listing_id = p_listing_id returning * into v_offer;

  if v_listing.status = 'active' then
    update public.listings
    set status = case when v_offer.status = 'accepted' then 'conditional' else 'offer_received' end
    where id = p_listing_id;
  elsif v_listing.status = 'offer_received' and v_offer.status = 'accepted' then
    update public.listings set status = 'conditional' where id = p_listing_id;
  end if;

  insert into public.listing_activity (listing_id, event_type, title, detail, actor_broker, metadata)
  values (p_listing_id, 'offer_updated', 'Offre modifiée', v_offer.amount::text, p_actor,
    jsonb_build_object('offerId', v_offer.id, 'status', v_offer.status, 'amount', v_offer.amount));
  if v_before.status is distinct from v_offer.status then
    insert into public.listing_activity (listing_id, event_type, title, detail, actor_broker, metadata)
    values (p_listing_id, 'offer_status_changed', 'Statut de l’offre modifié',
      v_before.status || ' → ' || v_offer.status, p_actor,
      jsonb_build_object('offerId', v_offer.id, 'before', v_before.status, 'after', v_offer.status));
  end if;
  return v_offer;
end;
$$;

create or replace function public.delete_listing_offer(
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
  v_offer public.listing_offers;
begin
  if p_actor = 'unassigned' then p_actor := null; end if;
  if exists (select 1 from public.listing_transaction_links where offer_id = p_offer_id) then
    raise exception 'Offre liée à une transaction' using errcode = 'P0001';
  end if;
  delete from public.listing_offers
  where id = p_offer_id and listing_id = p_listing_id returning * into v_offer;
  if not found then raise exception 'Offre introuvable' using errcode = 'P0001'; end if;
  insert into public.listing_activity (listing_id, event_type, title, detail, actor_broker, metadata)
  values (p_listing_id, 'offer_deleted', 'Offre supprimée', v_offer.amount::text, p_actor,
    jsonb_build_object('offerId', v_offer.id, 'status', v_offer.status, 'amount', v_offer.amount));
  return p_offer_id;
end;
$$;

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
  v_offer public.listing_offers;
  v_existing uuid;
  v_transaction_id uuid;
  v_address text;
begin
  if p_actor = 'unassigned' then p_actor := null; end if;
  select transaction_id into v_existing
  from public.listing_transaction_links
  where listing_id = p_listing_id and offer_id = p_offer_id;
  if found then return v_existing; end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing introuvable' using errcode = 'P0001'; end if;
  select * into v_offer from public.listing_offers
  where id = p_offer_id and listing_id = p_listing_id for update;
  if not found then raise exception 'Offre introuvable' using errcode = 'P0001'; end if;
  if v_listing.purpose <> 'sale' or v_offer.purpose <> 'sale' then
    raise exception 'Seule une offre de vente peut créer une transaction' using errcode = 'P0001';
  end if;
  if v_offer.status <> 'accepted' then
    raise exception 'L’offre doit être acceptée' using errcode = 'P0001';
  end if;
  select transaction_id into v_existing
  from public.listing_transaction_links where listing_id = p_listing_id;
  if found then raise exception 'Ce Listing possède déjà une transaction' using errcode = 'P0001'; end if;

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
  values (p_listing_id, 'transaction_created', 'Transaction créée depuis l’offre acceptée',
    v_offer.amount::text, p_actor,
    jsonb_build_object('offerId', p_offer_id, 'transactionId', v_transaction_id));
  return v_transaction_id;
end;
$$;

alter table public.listing_offers enable row level security;
alter table public.listing_transaction_links enable row level security;

revoke all on public.listing_offers from public, anon, authenticated;
revoke all on public.listing_transaction_links from public, anon, authenticated;
revoke execute on function public.create_listing_offer(uuid, jsonb, public.broker_assignment) from public, anon, authenticated;
revoke execute on function public.update_listing_offer(uuid, uuid, jsonb, public.broker_assignment) from public, anon, authenticated;
revoke execute on function public.delete_listing_offer(uuid, uuid, public.broker_assignment) from public, anon, authenticated;
revoke execute on function public.create_transaction_from_listing_offer(uuid, uuid, public.broker_assignment) from public, anon, authenticated;

grant select, insert, update, delete on public.listing_offers to service_role;
grant select, insert, update, delete on public.listing_transaction_links to service_role;
grant execute on function public.create_listing_offer(uuid, jsonb, public.broker_assignment) to service_role;
grant execute on function public.update_listing_offer(uuid, uuid, jsonb, public.broker_assignment) to service_role;
grant execute on function public.delete_listing_offer(uuid, uuid, public.broker_assignment) to service_role;
grant execute on function public.create_transaction_from_listing_offer(uuid, uuid, public.broker_assignment) to service_role;

commit;
