-- Monthly templates are independent of occurrences and their private invoices.
create table public.accounting_recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  category text check (category in ('marketing','operation')),
  vendor text check (length(trim(vendor)) between 1 and 200),
  description text check (length(trim(description)) between 1 and 1000),
  amount numeric(12,2) check (amount >= 0),
  notes text not null default '' check (length(notes) <= 5000),
  renewal_date date,
  day_of_month smallint not null check (day_of_month between 1 and 31),
  start_date date not null,
  next_due_date date not null check (next_due_date > start_date),
  active boolean not null default true,
  created_by text not null check (created_by in ('france','maxime','sandrine','immoplus')),
  updated_by text not null check (updated_by in ('france','maxime','sandrine','immoplus')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index accounting_recurring_due_idx on public.accounting_recurring_expenses(next_due_date) where active;
alter table public.accounting_recurring_expenses enable row level security;
revoke all on public.accounting_recurring_expenses from public, anon, authenticated;
grant all on public.accounting_recurring_expenses to service_role;
alter table public.accounting_expenses
  add column recurring_rule_id uuid references public.accounting_recurring_expenses(id) on delete restrict,
  add column recurring_period date,
  add constraint accounting_occurrence_pair check ((recurring_rule_id is null) = (recurring_period is null)),
  add constraint accounting_occurrence_month check (recurring_period = date_trunc('month',recurring_period)::date),
  add constraint accounting_unique_month unique(recurring_rule_id,recurring_period);

-- Always use the original desired day, never the shortened day of February.
create function public.accounting_month_date(p_month date,p_day integer)
returns date language sql immutable strict security invoker set search_path=public as $$
  select date_trunc('month',p_month)::date +
    (least(p_day,extract(day from date_trunc('month',p_month)+interval '1 month - 1 day')::integer)-1);
$$;

-- Optional date/rule arguments are service-only and permit isolated deterministic QA.
-- Public application callers never supply a date; the DB owns America/Toronto today.
create function public.accounting_materialize_recurring_expenses(
  p_today date default (now() at time zone 'America/Toronto')::date,
  p_rule_id uuid default null
) returns integer language plpgsql security invoker set search_path=public as $$
declare r accounting_recurring_expenses%rowtype; due date; created integer=0; inserted integer;
begin
  if p_today is null then raise exception 'Accounting date required'; end if;
  for r in select * from accounting_recurring_expenses
    where active and next_due_date<=p_today and (p_rule_id is null or id=p_rule_id)
    order by id for update
  loop
    due=r.next_due_date;
    while due<=p_today loop
      insert into accounting_expenses(category,vendor,description,amount,notes,renewal_date,expense_date,
        is_paid,paid_at,recurring_rule_id,recurring_period,created_by,updated_by)
      values(r.category,r.vendor,r.description,r.amount,r.notes,r.renewal_date,due,
        false,null,r.id,date_trunc('month',due)::date,r.created_by,r.updated_by)
      on conflict(recurring_rule_id,recurring_period) do nothing;
      get diagnostics inserted=row_count;
      created=created+inserted;
      due=accounting_month_date((date_trunc('month',due)+interval '1 month')::date,r.day_of_month);
    end loop;
    update accounting_recurring_expenses set next_due_date=due,updated_at=now() where id=r.id;
  end loop;
  return created;
end $$;

-- Atomic manual expense + rule creation/update. Existing file leases remain enforced.
create function public.accounting_save_recurring_expense(
  p_expense uuid,p_fields jsonb,p_monthly boolean,p_stop_confirmed boolean,p_actor text,p_token uuid default null
) returns uuid language plpgsql security invoker set search_path=public as $$
declare e accounting_expenses%rowtype; r accounting_recurring_expenses%rowtype;
  rid uuid; eid uuid; enabled boolean; first_date date; period date;
  today date=(now() at time zone 'America/Toronto')::date;
begin
  if p_actor is null or p_actor not in ('france','maxime','sandrine','immoplus') then raise exception 'Invalid accounting actor'; end if;
  if p_fields is null or jsonb_typeof(p_fields)<>'object' then raise exception 'Invalid accounting fields'; end if;
  first_date=(p_fields->>'expense_date')::date;
  if p_expense is not null then
    select * into e from accounting_expenses where id=p_expense for update;
    if not found or e.operation_token is distinct from p_token or p_token is null or e.operation_until<=now() then
      raise exception 'Accounting operation expired';
    end if;
    rid=e.recurring_rule_id; period=e.recurring_period;
    if rid is not null then select * into r from accounting_recurring_expenses where id=rid for update; end if;
  end if;
  enabled=coalesce(p_monthly,r.active,false);
  if enabled and first_date is null then raise exception 'Monthly start date required'; end if;
  if rid is not null and r.active and not enabled and not coalesce(p_stop_confirmed,false) then
    raise exception 'Confirm recurrence stop';
  end if;
  if rid is null and enabled then
    insert into accounting_recurring_expenses(category,vendor,description,amount,notes,renewal_date,
      day_of_month,start_date,next_due_date,created_by,updated_by)
    values(p_fields->>'category',p_fields->>'vendor',p_fields->>'description',(p_fields->>'amount')::numeric,
      coalesce(p_fields->>'notes',''),(p_fields->>'renewal_date')::date,extract(day from first_date)::smallint,
      first_date,accounting_month_date((date_trunc('month',first_date)+interval '1 month')::date,extract(day from first_date)::integer),p_actor,p_actor)
    returning id into rid;
    period=date_trunc('month',first_date)::date;
  elsif rid is not null then
    -- A stopped series resumes next month, without billing the inactive gap.
    update accounting_recurring_expenses set active=enabled,
      category=case when enabled then p_fields->>'category' else category end,
      vendor=case when enabled then p_fields->>'vendor' else vendor end,
      description=case when enabled then p_fields->>'description' else description end,
      amount=case when enabled then (p_fields->>'amount')::numeric else amount end,
      notes=case when enabled then coalesce(p_fields->>'notes','') else notes end,
      renewal_date=case when enabled then (p_fields->>'renewal_date')::date else renewal_date end,
      next_due_date=case when enabled and not r.active then greatest(next_due_date,
        accounting_month_date((date_trunc('month',today)+interval '1 month')::date,day_of_month)) else next_due_date end,
      updated_by=p_actor,updated_at=now() where id=rid;
  end if;
  if p_expense is null then
    insert into accounting_expenses(category,vendor,description,amount,notes,renewal_date,expense_date,
      recurring_rule_id,recurring_period,created_by,updated_by,is_paid,paid_at)
    values(p_fields->>'category',p_fields->>'vendor',p_fields->>'description',(p_fields->>'amount')::numeric,
      coalesce(p_fields->>'notes',''),(p_fields->>'renewal_date')::date,first_date,rid,period,p_actor,p_actor,false,null)
    returning id into eid;
  else
    update accounting_expenses set category=p_fields->>'category',vendor=p_fields->>'vendor',
      description=p_fields->>'description',amount=(p_fields->>'amount')::numeric,notes=coalesce(p_fields->>'notes',''),
      renewal_date=(p_fields->>'renewal_date')::date,expense_date=first_date,recurring_rule_id=rid,recurring_period=period,
      updated_by=p_actor,updated_at=now() where id=p_expense;
    eid=p_expense;
  end if;
  return eid;
end $$;
revoke all on function public.accounting_month_date(date,integer) from public,anon,authenticated;
revoke all on function public.accounting_materialize_recurring_expenses(date,uuid) from public,anon,authenticated;
revoke all on function public.accounting_save_recurring_expense(uuid,jsonb,boolean,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.accounting_month_date(date,integer) to service_role;
grant execute on function public.accounting_materialize_recurring_expenses(date,uuid) to service_role;
grant execute on function public.accounting_save_recurring_expense(uuid,jsonb,boolean,boolean,text,uuid) to service_role;
