-- Synthetic QA only; leaves no rows behind. Run after the broker migration.
begin;
set local role service_role;
do $$
declare a text; b text; eid uuid; rid uuid; nid uuid; token uuid=gen_random_uuid(); f jsonb; n integer;
begin
 select id into a from accounting_brokers() order by id limit 1;
 select id into b from accounting_brokers() order by id offset 1 limit 1;
 if a is null or b is null then raise exception 'Two CRM brokers required'; end if;
 f=jsonb_build_object('assigned_broker',a,'amount',100,'vendor','Synthetic broker QA','expense_date','2026-10-13');
 eid=accounting_save_recurring_expense(null,f,true,false,'immoplus');
 select recurring_rule_id into rid from accounting_expenses where id=eid;
 if (select assigned_broker::text from accounting_recurring_expenses where id=rid)<>a then raise exception 'Template lost broker'; end if;
 update accounting_expenses set is_paid=true,paid_at=now() where id=eid;
 insert into accounting_expense_documents(expense_id,storage_path,file_name,mime_type,size,state) values(eid,gen_random_uuid()::text,'synthetic.pdf','application/pdf',20,'current');
 n=accounting_materialize_recurring_expenses('2026-11-13',rid);
 if n<>1 then raise exception 'Expected one occurrence'; end if;
 select id into nid from accounting_expenses where recurring_rule_id=rid and id<>eid;
 if not exists(select 1 from accounting_expenses where id=nid and assigned_broker::text=a and not is_paid and paid_at is null) then raise exception 'Broker or payment lost'; end if;
 if exists(select 1 from accounting_expense_documents where expense_id=nid) then raise exception 'Invoice copied'; end if;
 if accounting_materialize_recurring_expenses('2026-11-13',rid)<>0 then raise exception 'Duplicate occurrence'; end if;
 update accounting_expenses set operation_token=token,operation_until=now()+interval '5 minutes' where id=nid;
 perform accounting_save_recurring_expense(nid,(f-'assigned_broker')||'{"expense_date":"2026-11-13","amount":150}',true,false,'immoplus',token);
 if (select assigned_broker::text from accounting_expenses where id=nid)<>a then raise exception 'Legacy update cleared broker'; end if;
 perform accounting_save_recurring_expense(nid,f||jsonb_build_object('assigned_broker',b,'expense_date','2026-11-13','amount',200),true,false,'immoplus',token);
 perform accounting_materialize_recurring_expenses('2026-12-13',rid);
 if not exists(select 1 from accounting_expenses where recurring_rule_id=rid and expense_date='2026-12-13' and assigned_broker::text=b and amount=200) then raise exception 'Template update lost broker'; end if;
 if (select assigned_broker::text from accounting_expenses where id=eid)<>a then raise exception 'History rewritten'; end if;
 perform accounting_save_recurring_expense(nid,f||jsonb_build_object('assigned_broker',b,'expense_date','2026-11-13'),false,true,'immoplus',token);
 if accounting_materialize_recurring_expenses('2027-02-13',rid)<>0 then raise exception 'Stopped recurrence created rows'; end if;
 begin
 insert into accounting_expenses(assigned_broker,created_by,updated_by) values('unassigned','immoplus','immoplus');
 raise exception 'Unassigned accepted';
 exception when check_violation then null; end;
 if has_function_privilege('anon','accounting_brokers()','execute') or has_table_privilege('authenticated','accounting_expenses','select') then raise exception 'Public access'; end if;
end $$;
rollback;
