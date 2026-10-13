-- Run on an isolated database with the original schema and payment migration.
begin;
do $$
declare t uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); r2 uuid:=gen_random_uuid(); v jsonb;
begin
 insert into public.transactions(id,broker) values(t,'maxime'),(t2,'france');
 insert into public.mortgage_referrals(id,broker,transaction_id,mortgage_advisor_name,institution_name,created_at)
 values(r,'maxime',t,'Conseiller test','Institution test','2025-12-15'),(r2,'france',t2,'Conseiller test','Institution test','2025-12-15');
 assert (select paid_at is null and paid_amount is null from mortgage_referrals where id=r),'default upcoming';
 perform mortgage_referral_payment(r,'maxime',1000,'2026-10-13',0,'maxime');
 assert (select paid_amount=1000 and paid_at='2026-10-13' and payment_updated_by='maxime' from mortgage_referrals where id=r),'paid';
 begin perform mortgage_referral_payment(r,'maxime',1000,'2026-10-13',0,'maxime');raise exception 'duplicate version accepted' using errcode='XX000';exception when sqlstate 'P0001' then null;end;
 perform mortgage_referral_payment(r2,'france',2000,'2026-01-01',0,'immoplus');
 assert (select sum(paid_amount)=1000 from mortgage_referrals where broker='maxime' and extract(year from paid_at)=2026),'broker total';
 perform mortgage_referral_payment(r,'maxime',1250.50,'2025-12-31',1,'maxime');
 assert (select sum(paid_amount)=1250.50 from mortgage_referrals where broker='maxime' and extract(year from paid_at)=2025),'date correction';
 assert (select count(*)=0 from mortgage_referrals where broker='maxime' and extract(year from paid_at)=2026),'old year removed';
 update mortgage_referrals set mortgage_advisor_name='Conseiller modifié' where id=r;
 assert (select paid_amount=1250.50 and payment_version=2 from mortgage_referrals where id=r),'edit preserves payment';
 begin perform mortgage_referral_payment(r,'maxime',0,'2026-01-01',2,'maxime');raise exception 'zero accepted' using errcode='XX000';exception when sqlstate 'P0001' then null;end;
 begin perform mortgage_referral_payment(r,'maxime',-1,'2026-01-01',2,'maxime');raise exception 'negative accepted' using errcode='XX000';exception when sqlstate 'P0001' then null;end;
 begin perform mortgage_referral_payment(r,'maxime',1.001,'2026-01-01',2,'maxime');raise exception 'rounding accepted' using errcode='XX000';exception when sqlstate 'P0001' then null;end;
 begin perform mortgage_referral_payment(r,'maxime',null,'2026-01-01',2,'maxime');raise exception 'partial accepted' using errcode='XX000';exception when sqlstate 'P0001' then null;end;
 begin perform mortgage_referral_payment(r,'france',1,'2026-01-01',2,'maxime');raise exception 'broker mismatch accepted' using errcode='XX000';exception when sqlstate 'P0001' then null;end;
 begin perform mortgage_referral_payment(r,'maxime',1,'2026-01-01',2,'sandrine');raise exception 'actor mismatch accepted' using errcode='XX000';exception when sqlstate 'P0001' then null;end;
 update mortgage_referrals set operation_until=now()+interval '1 minute' where id=r;
 begin perform mortgage_referral_payment(r,'maxime',1,'2026-01-01',2,'maxime');raise exception 'lease ignored' using errcode='XX000';exception when sqlstate 'P0001' then null;end;
 update mortgage_referrals set operation_until=null where id=r;
 perform mortgage_referral_payment(r,'maxime',null,null,2,'maxime');
 assert (select paid_amount is null and paid_at is null and payment_updated_by='maxime' from mortgage_referrals where id=r),'cancel';
 assert (select coalesce(sum(paid_amount),0)=0 from mortgage_referrals where broker='maxime'),'upcoming excluded';
 assert not has_function_privilege('anon','public.mortgage_referral_payment(uuid,public.broker_assignment,numeric,date,integer,text)','execute'),'anon rpc denied';
 assert not has_table_privilege('authenticated','public.mortgage_referrals','select'),'RLS access preserved';
 assert (select relrowsecurity from pg_class where oid='public.mortgage_referrals'::regclass),'RLS enabled';
end $$;
rollback;
