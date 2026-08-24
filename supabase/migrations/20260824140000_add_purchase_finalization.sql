begin;

do $migration$
declare
  v_transactions_before bigint;
  v_transactions_after bigint;
begin
  select count(*) into v_transactions_before from public.transactions;

  alter table public.transactions
    add column if not exists purchase_finalized_at timestamptz;

  select count(*) into v_transactions_after from public.transactions;
  if v_transactions_after <> v_transactions_before then
    raise exception 'Le nombre de Transactions a changé pendant la migration (% → %).',
      v_transactions_before, v_transactions_after;
  end if;
end
$migration$;

create or replace function public.complete_transaction_purchase(
  p_transaction_id uuid,
  p_purchase_price numeric,
  p_notary_date date
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

  update public.transactions
  set
    price = p_purchase_price,
    notary_date = p_notary_date,
    purchase_finalized_at = now()
  where id = p_transaction_id
  returning * into v_transaction;

  return v_transaction;
end;
$$;

revoke execute on function public.complete_transaction_purchase(
  uuid, numeric, date
) from public, anon, authenticated;

grant execute on function public.complete_transaction_purchase(
  uuid, numeric, date
) to service_role;

commit;
