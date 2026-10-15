begin;
do $$
declare v_transaction uuid; v_client uuid; v_second uuid;
begin
  if not (select relrowsecurity from pg_class where oid='public.transaction_direct_clients'::regclass) then raise exception 'RLS disabled'; end if;
  if has_table_privilege('anon','public.transaction_direct_clients','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.transaction_direct_clients','SELECT,INSERT,UPDATE,DELETE') then raise exception 'Unexpected public grant'; end if;
  select id into v_transaction from public.transactions limit 1;
  insert into public.transaction_direct_clients(transaction_id,name,created_by,updated_by)
    values(v_transaction,'QA synthetic A','immoplus','immoplus') returning id into v_client;
  insert into public.transaction_direct_clients(transaction_id,name,created_by,updated_by)
    values(v_transaction,'QA synthetic B','france','france') returning id into v_second;
  update public.transaction_direct_clients set request_note='QA updated',updated_by='maxime' where id=v_client and transaction_id=v_transaction;
  if not exists(select 1 from public.transaction_direct_clients where id=v_client and created_by='immoplus' and updated_by='maxime') then raise exception 'Audit failed'; end if;
  delete from public.transaction_direct_clients where id=v_client and transaction_id=v_transaction;
  if not exists(select 1 from public.transaction_direct_clients where id=v_second) then raise exception 'Targeted delete failed'; end if;
  begin
    insert into public.transaction_direct_clients(transaction_id,name,created_by,updated_by) values(gen_random_uuid(),'QA invalid FK','france','france');
    raise exception 'FK missing';
  exception when foreign_key_violation then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform 1 from public.transaction_direct_clients; raise exception 'anon select allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.transaction_direct_clients(name) values('QA'); raise exception 'anon insert allowed'; exception when insufficient_privilege then null; end;
  begin update public.transaction_direct_clients set name='QA' where false; raise exception 'anon update allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.transaction_direct_clients where false; raise exception 'anon delete allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform 1 from public.transaction_direct_clients; raise exception 'authenticated select allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.transaction_direct_clients(name) values('QA'); raise exception 'authenticated insert allowed'; exception when insufficient_privilege then null; end;
  begin update public.transaction_direct_clients set name='QA' where false; raise exception 'authenticated update allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.transaction_direct_clients where false; raise exception 'authenticated delete allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
