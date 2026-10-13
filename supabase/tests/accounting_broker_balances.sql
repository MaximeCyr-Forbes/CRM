-- Isolated regression; all writes roll back. Run on a disposable test database.
begin;
set local role service_role;
do $$
declare a text; b text; v integer; n integer; current_amount text; old_stamp timestamptz;
begin
 select id into a from accounting_brokers() order by id limit 1;
 select id into b from accounting_brokers() order by id offset 1 limit 1;
 assert (select balance::numeric=0 and version=0 from accounting_list_broker_balances() where broker=a),'Missing balance is zero';
 perform accounting_set_broker_balance(a::broker_assignment,500,'immoplus',0);
 perform accounting_set_broker_balance(a::broker_assignment,850.25,'immoplus',1);
 perform accounting_set_broker_balance(a::broker_assignment,-50,a,2);
 assert (select balance=-50 and version=3 and updated_by=a and updated_at is not null from accounting_broker_balances where broker::text=a),'Negative/actor/date persisted';
 assert (select count(*)=1 from accounting_broker_balances where broker::text=a),'One current balance';
 assert (select balance::numeric=0 and version=0 from accounting_list_broker_balances() where broker=b),'Other broker untouched';
 assert (select count(*)=3 from accounting_broker_balance_history where broker::text=a),'One audit per save';
 assert exists(select 1 from accounting_broker_balance_history where broker::text=a and old_balance=500 and new_balance=850.25 and version=2 and updated_by='immoplus'),'Audit old/new/actor';
 begin perform accounting_set_broker_balance(a::broker_assignment,999,'immoplus',2); raise exception 'Expected conflict'; exception when serialization_failure then null; end;
 begin perform accounting_set_broker_balance(a::broker_assignment,999,'immoplus',0); raise exception 'Expected insert conflict'; exception when serialization_failure then null; end;
 assert (select count(*)=3 from accounting_broker_balance_history where broker::text=a),'Failed saves never create audit entries';
 begin perform accounting_set_broker_balance(a::broker_assignment,1.005,'immoplus',3); raise exception 'Expected invalid decimals'; exception when invalid_parameter_value then null; end;
 begin perform accounting_set_broker_balance('unassigned',10,'immoplus',0); raise exception 'Expected invalid broker'; exception when invalid_parameter_value then null; end;
 insert into accounting_expenses(category,amount,expense_date,created_by,updated_by) values('marketing',100,'2026-10-13','immoplus','immoplus');
 assert (select balance=-50 from accounting_broker_balances where broker::text=a),'Expense cannot deduct balance';
 assert not has_table_privilege('anon','accounting_broker_balances','SELECT'),'Anon private';
 assert not has_table_privilege('authenticated','accounting_broker_balances','UPDATE'),'Browser role private';
 assert not has_function_privilege('anon','accounting_set_broker_balance(broker_assignment,numeric,text,integer)','EXECUTE'),'RPC private';
 assert not has_table_privilege('service_role','accounting_broker_balance_history','UPDATE'),'Audit immutable via application';
end $$;
rollback;
