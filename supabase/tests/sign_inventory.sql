-- Run in an isolated database with the migration installed. All test data rolls back.
begin;
do $$
declare a text; b text; l uuid:=gen_random_uuid(); x uuid:=gen_random_uuid(); y uuid:=gen_random_uuid(); d jsonb; r jsonb; n bigint;
begin
 select e::text into a from unnest(enum_range(null::public.broker_assignment)) e where e::text<>'unassigned' limit 1;
 select e::text into b from unnest(enum_range(null::public.broker_assignment)) e where e::text not in ('unassigned',a) limit 1;
 insert into public.listings(id,address,broker,status) values(l,'QA SYNTHETIC INVENTORY',a::public.broker_assignment,'active');
 perform public.sign_inventory_write('stock',jsonb_build_object('id','sign:'||a,'total',5,'version',0),'qa');
 perform public.sign_inventory_write('stock',jsonb_build_object('id','sign:'||b,'total',3,'version',0),'qa');
 perform public.sign_inventory_write('stock','{"id":"bac","total":5,"version":0}','qa');
 perform public.sign_inventory_write('stock','{"id":"addon:sold","total":10,"version":0}','qa');
 perform public.sign_inventory_write('stock','{"id":"addon:estimate","total":2,"version":0}','qa');
 perform public.sign_inventory_write('stock','{"id":"addon:open-house","total":1,"version":0}','qa');
 if (select available from public.sign_inventory_availability() where id='sign:'||a)<>5 then raise exception 'Initial stock'; end if;
 d:=jsonb_build_object('id',x,'listing_id',l,'broker',a,'sign_type','sale','has_bac',true,'addons',jsonb_build_array('addon:sold','addon:estimate'));
 perform public.sign_inventory_write('assign',d,'qa');
 if (select available from public.sign_inventory_availability() where id='sign:'||a)<>4 or (select available from public.sign_inventory_availability() where id='bac')<>4 or (select available from public.sign_inventory_availability() where id='addon:sold')<>9 then raise exception 'Assignment calculation'; end if;
 if (select available from public.sign_inventory_availability() where id='sign:'||b)<>3 then raise exception 'Broker contamination'; end if;
 perform public.sign_inventory_write('assign',d,'qa');
 if (select count(*) from public.sign_assignments where id=x)<>1 or (select count(*) from public.sign_inventory_events where assignment_id=x)<>1 then raise exception 'Duplicate request'; end if;
 perform public.sign_inventory_write('edit',d||jsonb_build_object('broker',b,'version',1,'has_bac',false,'addons',jsonb_build_array('addon:open-house')),'qa');
 if (select available from public.sign_inventory_availability() where id='sign:'||a)<>5 or (select available from public.sign_inventory_availability() where id='sign:'||b)<>2 or (select available from public.sign_inventory_availability() where id='bac')<>5 or (select available from public.sign_inventory_availability() where id='addon:sold')<>10 or (select available from public.sign_inventory_availability() where id='addon:open-house')<>0 then raise exception 'Atomic edit'; end if;
 begin
  perform public.sign_inventory_write('assign',d||jsonb_build_object('id',y,'addons',jsonb_build_array('addon:open-house')),'qa');raise exception 'Expected exhausted addon' using errcode='XX000';
 exception when sqlstate 'P0001' then null; end;
 if exists(select 1 from public.sign_assignments where id=y) then raise exception 'Failed assignment leaked'; end if;
 begin
  perform public.sign_inventory_write('stock',jsonb_build_object('id','sign:'||b,'total',0,'version',1),'qa');raise exception 'Expected below-used refusal' using errcode='XX000';
 exception when sqlstate 'P0001' then null; end;
 begin
  perform public.sign_inventory_write('edit',d||'{"version":1}'::jsonb,'qa');raise exception 'Expected stale version' using errcode='XX000';
 exception when sqlstate 'P0001' then null; end;
 perform public.sign_inventory_write('assign',d||jsonb_build_object('id',y),'qa');
 if (select count(*) from public.sign_assignments where listing_id=l and returned_at is null)<>2 then raise exception 'Multiple signs on listing'; end if;
 update public.listings set status='sold' where id=l;
 if (select count(*) from public.sign_assignments where listing_id=l and returned_at is null)<>2 then raise exception 'Sold auto-return'; end if;
 perform public.sign_inventory_write('return',jsonb_build_object('id',x,'version',2),'qa');
 perform public.sign_inventory_write('return',jsonb_build_object('id',x,'version',2),'qa');
 if (select available from public.sign_inventory_availability() where id='sign:'||b)<>3 then raise exception 'Return did not restore'; end if;
 r:=public.sign_inventory_assignments(true,'QA SYNTHETIC',b,0);
 if (r->>'count')::integer<>1 or r#>>'{data,0,returned_by}'<>'qa' then raise exception 'History'; end if;
 delete from public.listings where id=l;
 if not exists(select 1 from public.sign_assignments where id=x and listing_id is null and returned_at is not null and address_snapshot like '%QA SYNTHETIC%') then raise exception 'History lost on listing delete'; end if;
 perform public.sign_inventory_write('return',jsonb_build_object('id',y,'version',1),'qa');
 if exists(select 1 from public.sign_inventory_availability() where available<0 or used<>0) then raise exception 'Availability invariant'; end if;
 if has_table_privilege('service_role','public.sign_assignments','INSERT') or has_table_privilege('anon','public.sign_assignments','SELECT') or has_function_privilege('anon','public.sign_inventory_write(text,jsonb,text)','EXECUTE') or has_function_privilege('authenticated','public.sign_inventory_write(text,jsonb,text)','EXECUTE') then raise exception 'Unexpected privilege'; end if;
 if exists(select 1 from pg_class where relname in ('sign_assignments','sign_inventory_stock','sign_inventory_types','sign_inventory_events','sign_assignment_addons') and not relrowsecurity) then raise exception 'RLS missing'; end if;
 raise notice 'Inventory SQL assertions passed';
end $$;
rollback;
