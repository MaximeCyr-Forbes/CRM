begin;

do $migration$
declare
  v_listings_before bigint;
  v_listings_after bigint;
begin
  select count(*) into v_listings_before from public.listings;

  alter table public.listings
    add column if not exists sold_price numeric(14, 2),
    add column if not exists notary_date date,
    add column if not exists collaborating_broker_name text not null default '';

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.listings'::regclass
      and conname = 'listings_sold_price_check'
  ) then
    alter table public.listings
      add constraint listings_sold_price_check
      check (sold_price is null or sold_price >= 0);
  end if;

  select count(*) into v_listings_after from public.listings;
  if v_listings_after <> v_listings_before then
    raise exception 'Le nombre de Listings a changé pendant la migration (% → %).',
      v_listings_before, v_listings_after;
  end if;
end
$migration$;

create or replace function public.complete_listing_sale(
  p_listing_id uuid,
  p_sold_price numeric,
  p_notary_date date,
  p_collaborating_broker_name text,
  p_no_collaborating_broker boolean,
  p_actor_broker public.broker_assignment
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.listings;
  v_listing public.listings;
  v_actor public.broker_assignment;
  v_collaborating_broker_name text;
begin
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

  v_actor := p_actor_broker;
  if v_actor = 'unassigned' then v_actor := null; end if;

  select * into v_before
  from public.listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'Listing introuvable.' using errcode = 'P0001';
  end if;
  if v_before.purpose <> 'sale' then
    raise exception 'Seul un Listing en vente peut être marqué comme vendu.' using errcode = 'P0001';
  end if;
  if v_before.status = 'sold' then
    raise exception 'Ce Listing est déjà marqué comme vendu.' using errcode = 'P0001';
  end if;

  update public.listings
  set
    sold_price = p_sold_price,
    notary_date = p_notary_date,
    collaborating_broker_name = v_collaborating_broker_name,
    status = 'sold'
  where id = p_listing_id
  returning * into v_listing;

  insert into public.listing_activity (
    listing_id, event_type, title, detail, actor_broker, metadata
  ) values (
    p_listing_id,
    'sale_completed',
    'Listing vendu',
    'Vendu ' || p_sold_price::text || ' $ · Notaire ' || p_notary_date::text
      || ' · Courtier collaborateur : '
      || case when v_collaborating_broker_name = '' then 'Aucun' else v_collaborating_broker_name end,
    v_actor,
    jsonb_build_object(
      'soldPrice', p_sold_price,
      'notaryDate', p_notary_date,
      'collaboratingBrokerName', v_collaborating_broker_name
    )
  );

  insert into public.listing_activity (
    listing_id, event_type, title, detail, actor_broker, metadata
  ) values (
    p_listing_id,
    'status_changed',
    'Statut modifié',
    v_before.status || ' → sold',
    v_actor,
    jsonb_build_object('before', v_before.status, 'after', 'sold')
  );

  return v_listing;
end;
$$;

revoke execute on function public.complete_listing_sale(
  uuid, numeric, date, text, boolean, public.broker_assignment
) from public, anon, authenticated;

grant execute on function public.complete_listing_sale(
  uuid, numeric, date, text, boolean, public.broker_assignment
) to service_role;

commit;
