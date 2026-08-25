begin;

do $migration$
declare
  v_transactions_before bigint;
  v_listings_before bigint;
  v_offers_before bigint;
  v_links_before bigint;
  v_transactions_after bigint;
  v_listings_after bigint;
  v_offers_after bigint;
  v_links_after bigint;
begin
  select count(*) into v_transactions_before from public.transactions;
  select count(*) into v_listings_before from public.listings;
  select count(*) into v_offers_before from public.listing_offers;
  select count(*) into v_links_before from public.listing_transaction_links;

  alter table public.listing_transaction_links
    drop constraint if exists listing_transaction_links_listing_id_fkey;
  alter table public.listing_transaction_links
    add constraint listing_transaction_links_listing_id_fkey
    foreign key (listing_id) references public.listings(id) on delete restrict;

  alter table public.listing_transaction_links
    drop constraint if exists listing_transaction_links_offer_id_fkey;
  alter table public.listing_transaction_links
    add constraint listing_transaction_links_offer_id_fkey
    foreign key (offer_id) references public.listing_offers(id) on delete restrict;

  alter table public.listing_transaction_links
    drop constraint if exists listing_transaction_links_transaction_id_fkey;
  alter table public.listing_transaction_links
    add constraint listing_transaction_links_transaction_id_fkey
    foreign key (transaction_id) references public.transactions(id) on delete restrict;

  select count(*) into v_transactions_after from public.transactions;
  select count(*) into v_listings_after from public.listings;
  select count(*) into v_offers_after from public.listing_offers;
  select count(*) into v_links_after from public.listing_transaction_links;

  if v_transactions_after <> v_transactions_before
    or v_listings_after <> v_listings_before
    or v_offers_after <> v_offers_before
    or v_links_after <> v_links_before then
    raise exception 'Les volumes immobiliers ont changé pendant la migration.';
  end if;
end
$migration$;

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
  v_listing public.listings;
  v_listing_id uuid;
  v_offer_id uuid;
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
  if v_transaction.status = 'cancelled' then
    raise exception 'Une Transaction annulée ne peut pas être finalisée.' using errcode = 'P0001';
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

  select link.listing_id, link.offer_id
  into v_listing_id, v_offer_id
  from public.listing_transaction_links as link
  where link.transaction_id = p_transaction_id;

  if v_listing_id is not null then
    select * into v_listing
    from public.listings
    where id = v_listing_id
    for update;

    if not found then
      raise exception 'Listing source introuvable.' using errcode = 'P0001';
    end if;
    if v_listing.purpose <> 'sale' then
      raise exception 'Le Listing source n''est pas un mandat de vente.' using errcode = 'P0001';
    end if;
    if v_listing.status in ('sold', 'rented') then
      raise exception 'Le Listing source est déjà finalisé.' using errcode = 'P0001';
    end if;
  end if;

  update public.transactions
  set
    sold_price = p_sold_price,
    notary_date = p_notary_date,
    collaborating_broker_name = v_collaborating_broker_name,
    sale_finalized_at = now()
  where id = p_transaction_id
  returning * into v_transaction;

  if v_listing_id is not null then
    update public.listings
    set
      sold_price = p_sold_price,
      notary_date = p_notary_date,
      collaborating_broker_name = v_collaborating_broker_name,
      status = 'sold'
    where id = v_listing_id;

    insert into public.listing_activity (
      listing_id, event_type, title, detail, actor_broker, metadata
    ) values (
      v_listing_id,
      'sale_completed',
      'Listing vendu',
      'Vendu ' || p_sold_price::text || ' $ · Notaire ' || p_notary_date::text
        || ' · Courtier collaborateur : '
        || case when v_collaborating_broker_name = '' then 'Aucun' else v_collaborating_broker_name end,
      v_transaction.broker,
      jsonb_build_object(
        'transactionId', p_transaction_id,
        'offerId', v_offer_id,
        'soldPrice', p_sold_price,
        'notaryDate', p_notary_date,
        'collaboratingBrokerName', v_collaborating_broker_name
      )
    );

    insert into public.listing_activity (
      listing_id, event_type, title, detail, actor_broker, metadata
    ) values (
      v_listing_id,
      'status_changed',
      'Statut modifié',
      v_listing.status || ' → sold',
      v_transaction.broker,
      jsonb_build_object(
        'transactionId', p_transaction_id,
        'before', v_listing.status,
        'after', 'sold'
      )
    );
  end if;

  return v_transaction;
end;
$$;

create or replace function public.protect_finalized_transaction_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (old.type = 'sale' and old.sale_finalized_at is not null)
    or (old.type = 'purchase' and old.purchase_finalized_at is not null) then
    if tg_op = 'DELETE' then
      raise exception 'Une transaction finalisée doit être conservée dans l’historique.' using errcode = 'P0001';
    end if;
    raise exception 'Une transaction finalisée ne peut plus être modifiée.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_protect_finalized_history on public.transactions;
create trigger transactions_protect_finalized_history
before update or delete on public.transactions
for each row execute function public.protect_finalized_transaction_history();

create or replace function public.protect_finalized_transaction_contacts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_transaction public.transactions;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select * into v_transaction from public.transactions where id = old.transaction_id;
    if found and (
      (v_transaction.type = 'sale' and v_transaction.sale_finalized_at is not null)
      or (v_transaction.type = 'purchase' and v_transaction.purchase_finalized_at is not null)
    ) then
      raise exception 'Une transaction finalisée ne peut plus être modifiée.' using errcode = 'P0001';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select * into v_transaction from public.transactions where id = new.transaction_id;
    if found and (
      (v_transaction.type = 'sale' and v_transaction.sale_finalized_at is not null)
      or (v_transaction.type = 'purchase' and v_transaction.purchase_finalized_at is not null)
    ) then
      raise exception 'Une transaction finalisée ne peut plus être modifiée.' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists transaction_contacts_protect_finalized_history on public.transaction_contacts;
create trigger transaction_contacts_protect_finalized_history
before insert or update or delete on public.transaction_contacts
for each row execute function public.protect_finalized_transaction_contacts();

create or replace function public.protect_finalized_listing_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('sold', 'rented') then
    if tg_op = 'DELETE' then
      raise exception 'Un Listing finalisé doit être conservé dans l’historique.' using errcode = 'P0001';
    end if;
    raise exception 'Un Listing finalisé ne peut plus être modifié.' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' and exists (
    select 1
    from public.listing_transaction_links as link
    where link.listing_id = old.id
  ) then
    raise exception 'Ce Listing possède un historique de Transaction et ne peut pas être supprimé.' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists listings_protect_finalized_history on public.listings;
create trigger listings_protect_finalized_history
before update or delete on public.listings
for each row execute function public.protect_finalized_listing_history();

revoke execute on function public.complete_transaction_sale(
  uuid, numeric, date, text, boolean
) from public, anon, authenticated;

grant execute on function public.complete_transaction_sale(
  uuid, numeric, date, text, boolean
) to service_role;

revoke execute on function public.complete_listing_sale(
  uuid, numeric, date, text, boolean, public.broker_assignment
) from public, anon, authenticated, service_role;

commit;
