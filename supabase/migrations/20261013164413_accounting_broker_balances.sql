-- Manual marketing fund only. No transaction/expense triggers or calculations.
create table public.accounting_broker_balances (
  broker public.broker_assignment primary key check (broker <> 'unassigned'),
  balance numeric(12,2) not null check (balance between -9999999999.99 and 9999999999.99),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by text not null
);
create table public.accounting_broker_balance_history (
  id uuid primary key default gen_random_uuid(),
  broker public.broker_assignment not null check (broker <> 'unassigned'),
  old_balance numeric(12,2) not null,
  new_balance numeric(12,2) not null,
  updated_at timestamptz not null,
  updated_by text not null,
  version integer not null,
  unique(broker,version)
);
alter table public.accounting_broker_balances enable row level security;
alter table public.accounting_broker_balance_history enable row level security;
revoke all on public.accounting_broker_balances,public.accounting_broker_balance_history from public,anon,authenticated,service_role;
grant select,insert,update on public.accounting_broker_balances to service_role;
grant select,insert on public.accounting_broker_balance_history to service_role;

create function public.accounting_audit_broker_balance() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  insert into accounting_broker_balance_history(broker,old_balance,new_balance,updated_at,updated_by,version)
  values(new.broker,case when tg_op='INSERT' then 0 else old.balance end,new.balance,new.updated_at,new.updated_by,new.version);
  return new;
end $$;
revoke all on function public.accounting_audit_broker_balance() from public,anon,authenticated;
grant execute on function public.accounting_audit_broker_balance() to service_role;
create trigger accounting_broker_balance_audit after insert or update on public.accounting_broker_balances
for each row execute function public.accounting_audit_broker_balance();

create function public.accounting_list_broker_balances()
returns table(broker text,label text,balance text,version integer,updated_at timestamptz,updated_by text)
language sql stable security invoker set search_path=public as $$
  select b.id,b.label,coalesce(v.balance,0::numeric(12,2))::text,coalesce(v.version,0),v.updated_at,v.updated_by
  from accounting_brokers() b left join accounting_broker_balances v on v.broker::text=b.id;
$$;

-- Version comparison prevents an old browser tab from silently overwriting a newer edit.
-- Only the CRM server may call this RPC; it resolves actor and permissions first.
create function public.accounting_set_broker_balance(p_broker public.broker_assignment,p_balance numeric,p_actor text,p_expected_version integer)
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
  if saved.broker is null then raise exception 'Balance changed; reload before saving' using errcode='40001'; end if;
  return query select saved.broker::text,saved.balance::text,saved.version,saved.updated_at,saved.updated_by;
end $$;
revoke all on function public.accounting_list_broker_balances() from public,anon,authenticated;
revoke all on function public.accounting_set_broker_balance(public.broker_assignment,numeric,text,integer) from public,anon,authenticated;
grant execute on function public.accounting_list_broker_balances() to service_role;
grant execute on function public.accounting_set_broker_balance(public.broker_assignment,numeric,text,integer) to service_role;
