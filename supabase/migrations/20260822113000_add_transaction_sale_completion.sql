begin;

do $migration$
declare
  v_transactions_before bigint;
  v_transactions_after bigint;
begin
  select count(*) into v_transactions_before from public.transactions;

  alter table public.transactions
    add column if not exists sold_price numeric(14, 2),
    add column if not exists notary_date date,
    add column if not exists collaborating_broker_name text not null default '',
    add column if not exists sale_finalized_at timestamptz;

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

  select count(*) into v_transactions_after from public.transactions;
  if v_transactions_after <> v_transactions_before then
    raise exception 'Le nombre de Transactions a changé pendant la migration (% → %).',
      v_transactions_before, v_transactions_after;
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

revoke execute on function public.complete_transaction_sale(
  uuid, numeric, date, text, boolean
) from public, anon, authenticated;

grant execute on function public.complete_transaction_sale(
  uuid, numeric, date, text, boolean
) to service_role;

commit;
