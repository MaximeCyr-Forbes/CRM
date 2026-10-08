-- Run against a database with the accounting migrations applied. All QA rows roll back.
begin;
set local role service_role;
do $$
declare first_id uuid; rule_id uuid; nov_id uuid; last_id uuid; lease uuid=gen_random_uuid();
  f jsonb='{"category":"marketing","vendor":"Synthetic monthly QA","description":"No real customer","amount":400,"expense_date":"2026-10-08","renewal_date":"2027-10-08","notes":"Synthetic"}';
  n integer; d integer; y integer; jan date; feb date; leap integer;
begin
  first_id=public.accounting_save_recurring_expense(null,f,true,false,'maxime',null);
  select recurring_rule_id into rule_id from public.accounting_expenses where id=first_id;
  assert rule_id is not null,'first occurrence linked';
  assert (select next_due_date='2026-11-08' from public.accounting_recurring_expenses where id=rule_id),'first next due';
  assert (select count(*)=1 from public.accounting_expenses where recurring_rule_id=rule_id),'no future flood';
  update public.accounting_expenses set is_paid=true,paid_at=now() where id=first_id;
  insert into public.accounting_expense_documents(expense_id,storage_path,file_name,mime_type,size,state)
    values(first_id,gen_random_uuid()::text,'synthetic.pdf','application/pdf',11,'current');
  assert public.accounting_materialize_recurring_expenses('2026-11-07',rule_id)=0,'not due before day';
  assert public.accounting_materialize_recurring_expenses('2026-11-08',rule_id)=1,'next month generated';
  assert public.accounting_materialize_recurring_expenses('2026-11-08',rule_id)=0,'repeat idempotent';
  select id into nov_id from public.accounting_expenses where recurring_rule_id=rule_id and recurring_period='2026-11-01';
  assert (select not is_paid and paid_at is null and amount=400 from public.accounting_expenses where id=nov_id),'unpaid defaults';
  assert not exists(select 1 from public.accounting_expense_documents where expense_id=nov_id),'invoice never copied';
  update public.accounting_expenses set operation_token=lease,operation_until=now()+interval '3 minutes' where id=nov_id;
  perform public.accounting_save_recurring_expense(nov_id,f||'{"amount":425,"expense_date":"2026-11-09"}'::jsonb,true,false,'france',lease);
  assert (select day_of_month=8 from public.accounting_recurring_expenses where id=rule_id),'local date exception preserves anchor';
  assert (select recurring_period='2026-11-01' from public.accounting_expenses where id=nov_id),'period identity unchanged';
  assert (select amount=400 and is_paid from public.accounting_expenses where id=first_id),'historical amount and paid untouched';
  delete from public.accounting_expenses where id=nov_id;
  assert public.accounting_materialize_recurring_expenses('2027-01-10',rule_id)=2,'missed December and January';
  assert not exists(select 1 from public.accounting_expenses where id=nov_id or (recurring_rule_id=rule_id and recurring_period='2026-11-01')),'deleted occurrence never recreated';
  assert (select count(*)=2 from public.accounting_expenses where recurring_rule_id=rule_id and amount=425),'future template only';
  assert (select next_due_date='2027-02-08' from public.accounting_recurring_expenses where id=rule_id),'pointer advanced';
  select id into last_id from public.accounting_expenses where recurring_rule_id=rule_id and recurring_period='2027-01-01';
  update public.accounting_expenses set operation_token=lease,operation_until=now()+interval '3 minutes' where id=last_id;
  begin
    perform public.accounting_save_recurring_expense(last_id,f,false,false,'maxime',lease);
    raise exception 'Stop should require confirmation';
  exception when raise_exception then
    if sqlerrm<>'Confirm recurrence stop' then raise; end if;
  end;
  perform public.accounting_save_recurring_expense(last_id,f||'{"expense_date":"2027-01-08","amount":425}'::jsonb,false,true,'maxime',lease);
  assert public.accounting_materialize_recurring_expenses('2028-01-10',rule_id)=0,'stopped series creates nothing';
  assert (select count(*)=3 from public.accounting_expenses where recurring_rule_id=rule_id),'history preserved on stop';
  assert exists(select 1 from public.accounting_expense_documents where expense_id=first_id and state='current'),'historical invoice preserved';
  begin
    perform public.accounting_save_recurring_expense(null,'{}',true,false,'maxime',null);
    raise exception 'Date should be required';
  exception when raise_exception then
    if sqlerrm<>'Monthly start date required' then raise; end if;
  end;
  -- Full RPC path for 29/30/31 across leap and non-leap Februaries.
  for y in 2027..2028 loop
    for d in 29..31 loop
      jan=make_date(y,1,d);leap=case when y=2028 then 29 else 28 end;feb=make_date(y,2,least(d,leap));
      first_id=public.accounting_save_recurring_expense(null,f||jsonb_build_object('expense_date',jan),true,false,'immoplus',null);
      select recurring_rule_id into rule_id from public.accounting_expenses where id=first_id;
      assert (select next_due_date=feb from public.accounting_recurring_expenses where id=rule_id),'February clamp';
      assert public.accounting_materialize_recurring_expenses(make_date(y,4,30),rule_id)=3,'February March April generated';
      assert exists(select 1 from public.accounting_expenses where recurring_rule_id=rule_id and expense_date=make_date(y,3,d)),'original day restored in March';
      assert exists(select 1 from public.accounting_expenses where recurring_rule_id=rule_id and expense_date=make_date(y,4,least(d,30))),'April clamp';
    end loop;
  end loop;
  assert not has_function_privilege('anon','public.accounting_materialize_recurring_expenses(date,uuid)','execute'),'RPC private';
  assert not has_table_privilege('authenticated','public.accounting_recurring_expenses','select'),'rules private';
  assert (select relrowsecurity from pg_class where oid='public.accounting_recurring_expenses'::regclass),'RLS enabled';
end $$;
rollback;
select 'monthly accounting SQL regression passed; all QA rolled back' as result;
