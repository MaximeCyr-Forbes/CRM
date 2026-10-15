begin;
do $$
declare tx uuid; batch uuid:=gen_random_uuid(); receipt uuid;
begin
 if not (select relrowsecurity from pg_class where oid='public.transaction_direct_client_email_deliveries'::regclass) then raise exception 'RLS missing'; end if;
 if has_table_privilege('anon','public.transaction_direct_client_email_deliveries','SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.transaction_direct_client_email_deliveries','SELECT,INSERT,UPDATE,DELETE') then raise exception 'Unexpected grant'; end if;
 select id into tx from public.transactions limit 1;
 insert into public.transaction_direct_client_email_deliveries(batch_id,transaction_id,actor,sender_broker,payload_hash,recipient_name,recipient_email,normalized_email,subject) values(batch,tx,'maxime','maxime','hash','Synthetic','qa@example.invalid','qa@example.invalid','QA') returning id into receipt;
 begin
 insert into public.transaction_direct_client_email_deliveries(batch_id,transaction_id,actor,sender_broker,payload_hash,recipient_name,recipient_email,normalized_email,subject) values(batch,tx,'maxime','maxime','hash','Synthetic','qa@example.invalid','qa@example.invalid','QA');raise exception 'Duplicate permitted';
 exception when unique_violation then null;end;
 update public.transaction_direct_client_email_deliveries set status='sending' where id=receipt and status='pending';
 if not found then raise exception 'Claim failed'; end if;
 update public.transaction_direct_client_email_deliveries set status='sending' where id=receipt and status='pending';
 if found then raise exception 'Double claim'; end if;
 begin update public.transaction_direct_client_email_deliveries set status='sent' where id=receipt;raise exception 'Sent without gmail id';exception when check_violation then null;end;
end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.transaction_direct_client_email_deliveries;raise exception 'anon select';exception when insufficient_privilege then null;end;
 begin insert into public.transaction_direct_client_email_deliveries(subject) values('QA');raise exception 'anon insert';exception when insufficient_privilege then null;end;
 begin update public.transaction_direct_client_email_deliveries set subject='QA' where false;raise exception 'anon update';exception when insufficient_privilege then null;end;
 begin delete from public.transaction_direct_client_email_deliveries where false;raise exception 'anon delete';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform 1 from public.transaction_direct_client_email_deliveries;raise exception 'auth select';exception when insufficient_privilege then null;end;
 begin insert into public.transaction_direct_client_email_deliveries(subject) values('QA');raise exception 'auth insert';exception when insufficient_privilege then null;end;
 begin update public.transaction_direct_client_email_deliveries set subject='QA' where false;raise exception 'auth update';exception when insufficient_privilege then null;end;
 begin delete from public.transaction_direct_client_email_deliveries where false;raise exception 'auth delete';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
