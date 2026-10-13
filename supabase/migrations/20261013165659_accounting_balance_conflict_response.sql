-- A stale version returns no row. The API maps that to HTTP 409 without a database retry error.
create or replace function public.accounting_set_broker_balance(p_broker public.broker_assignment,p_balance numeric,p_actor text,p_expected_version integer)
returns table(broker text,balance text,version integer,updated_at timestamptz,updated_by text)
language plpgsql security invoker set search_path=public as $$
declare saved accounting_broker_balances%rowtype;
begin
  if p_broker is null or p_broker='unassigned' or p_expected_version is null or p_expected_version<0
    or p_balance is null or p_balance not between -9999999999.99 and 9999999999.99 or p_balance<>round(p_balance,2)
    or p_actor is null or not (p_actor='immoplus' or exists(select 1 from accounting_brokers() b where b.id=p_actor)) then
    raise exception 'Invalid balance fields' using errcode='22023';
  end if;
  if p_expected_version=0 then
    insert into accounting_broker_balances as b(broker,balance,updated_by)
    values(p_broker,p_balance,p_actor) on conflict on constraint accounting_broker_balances_pkey do nothing returning b.* into saved;
  else
    update accounting_broker_balances b set balance=p_balance,version=b.version+1,updated_at=clock_timestamp(),updated_by=p_actor
    where b.broker=p_broker and b.version=p_expected_version returning b.* into saved;
  end if;
  if saved.broker is null then return; end if;
  return query select saved.broker::text,saved.balance::text,saved.version,saved.updated_at,saved.updated_by;
end $$;
