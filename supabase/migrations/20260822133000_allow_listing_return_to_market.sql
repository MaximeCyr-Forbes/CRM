begin;

do $migration$
declare
  v_listings_before bigint;
  v_transactions_before bigint;
  v_offers_before bigint;
  v_links_before bigint;
  v_activity_before bigint;
  v_listings_after bigint;
  v_transactions_after bigint;
  v_offers_after bigint;
  v_links_after bigint;
  v_activity_after bigint;
begin
  select count(*) into v_listings_before from public.listings;
  select count(*) into v_transactions_before from public.transactions;
  select count(*) into v_offers_before from public.listing_offers;
  select count(*) into v_links_before from public.listing_transaction_links;
  select count(*) into v_activity_before from public.listing_activity;

  alter table public.listing_transaction_links
    drop constraint if exists listing_transaction_links_listing_unique;

  create index if not exists listing_transaction_links_listing_idx
    on public.listing_transaction_links (listing_id);

  select count(*) into v_listings_after from public.listings;
  select count(*) into v_transactions_after from public.transactions;
  select count(*) into v_offers_after from public.listing_offers;
  select count(*) into v_links_after from public.listing_transaction_links;
  select count(*) into v_activity_after from public.listing_activity;

  if v_listings_after <> v_listings_before
    or v_transactions_after <> v_transactions_before
    or v_offers_after <> v_offers_before
    or v_links_after <> v_links_before
    or v_activity_after <> v_activity_before then
    raise exception 'Le nombre de dossiers a changé pendant la migration.';
  end if;
end
$migration$;

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

commit;
