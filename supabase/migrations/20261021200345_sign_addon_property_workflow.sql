-- Support transaction-only properties without manufacturing a Listing.
alter table public.sign_assignments add column transaction_id uuid references public.transactions(id) on delete set null;
alter table public.sign_assignments add constraint sign_assignment_one_property check (listing_id is null or transaction_id is null);
create index sign_assignments_transaction_idx on public.sign_assignments(transaction_id);

-- Normalize punctuation, accents and optional street designators in both searches.
create function public.sign_inventory_address_key(value text) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select trim(regexp_replace(regexp_replace(public.normalize_contact_address_part(value), '\m(rue|avenue|av|boulevard|boul|chemin|ch|street|st)\M',' ','g'),' +',' ','g'));
$$;
create function public.sign_inventory_address_matches(address text,query text) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select not exists(select 1 from regexp_split_to_table(public.sign_inventory_address_key(left(query,160)),' +') token
 where token<>'' and position(token in public.sign_inventory_address_key(address))=0);
$$;
revoke all on function public.sign_inventory_address_key(text),public.sign_inventory_address_matches(text,text) from public,anon;
grant execute on function public.sign_inventory_address_key(text),public.sign_inventory_address_matches(text,text) to authenticated,service_role;

create or replace function public.sign_inventory_write(p_action text,p_data jsonb,p_actor text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_id uuid; v_old sign_assignments; v_new sign_assignments; v_stock sign_inventory_stock;
 v_before jsonb; v_after jsonb; v_address text; v_addons text[]; v_bad record; v_broker broker_assignment;
begin
 if p_actor is null or length(trim(p_actor))=0 then raise exception using errcode='P0001',message='Utilisateur requis.'; end if;
 if p_action not in ('assign','edit','return','stock') then raise exception using errcode='P0001',message='Opération invalide.'; end if;
 -- One short transaction for all stock mutations. Waiters re-read committed stock.
 perform pg_advisory_xact_lock(714203,1);
 if p_action='stock' then
   if p_data->>'id' like 'sign:%' then
     v_broker:=substring(p_data->>'id' from 6)::broker_assignment;
     insert into sign_inventory_stock(id,kind,broker,label) values(p_data->>'id','sign',v_broker,'Pancartes') on conflict do nothing;
   end if;
   select * into v_stock from sign_inventory_stock where id=p_data->>'id';
   if not found then raise exception using errcode='P0001',message='Article introuvable.'; end if;
   if v_stock.version is distinct from (p_data->>'version')::integer then raise exception using errcode='P0001',message='Inventaire modifié entre-temps. Actualisez puis réessayez.'; end if;
   if (p_data->>'total')::integer is null or (p_data->>'total')::integer not between 0 and 100000 then raise exception using errcode='P0001',message='Quantité totale invalide.'; end if;
   select * into v_bad from sign_inventory_availability() where id=v_stock.id;
   if (p_data->>'total')::integer<v_bad.used then raise exception using errcode='P0001',message=format('%s article(s) en circulation. Le total ne peut pas être inférieur à %s.',v_bad.used,v_bad.used); end if;
   update sign_inventory_stock set total=(p_data->>'total')::integer,version=version+1,updated_at=clock_timestamp(),updated_by=p_actor where id=v_stock.id;
   insert into sign_inventory_events(stock_id,action,before_data,after_data,created_by) values(v_stock.id,'stock',to_jsonb(v_stock),p_data,p_actor);
   return jsonb_build_object('id',v_stock.id);
 end if;
 v_id:=(p_data->>'id')::uuid;
 select * into v_old from sign_assignments where id=v_id;
 if p_action='assign' and found then
   -- Same operation ID is safe to retry, including after a lost HTTP response.
   return jsonb_build_object('id',v_id,'replayed',true);
 end if;
 if p_action<>'assign' then
   if v_old.id is null then raise exception using errcode='P0001',message='Attribution introuvable.'; end if;
   if p_action='return' and v_old.returned_at is not null then return jsonb_build_object('id',v_id,'replayed',true); end if;
   if v_old.returned_at is not null then raise exception using errcode='P0001',message='Ce matériel a déjà été retourné.'; end if;
   if v_old.version is distinct from (p_data->>'version')::integer then raise exception using errcode='P0001',message='Attribution modifiée entre-temps. Actualisez puis réessayez.'; end if;
   v_before:=to_jsonb(v_old)||jsonb_build_object('addons',(select coalesce(jsonb_agg(stock_id),'[]'::jsonb) from sign_assignment_addons where assignment_id=v_id));
 end if;
 if p_action='return' then
   update sign_assignments set returned_at=clock_timestamp(),returned_by=p_actor,updated_at=clock_timestamp(),updated_by=p_actor,version=version+1 where id=v_id returning * into v_new;
 else
   if nullif(p_data->>'listing_id','') is not null and nullif(p_data->>'transaction_id','') is not null then
     raise exception using errcode='P0001',message='Choisissez une seule propriété.';
   end if;
   if nullif(p_data->>'transaction_id','') is not null then
     select address into v_address from transactions where id=(p_data->>'transaction_id')::uuid;
   else
     select concat_ws(', ',concat_ws(' ',nullif(civic_number,''),address),nullif(apartment,''),nullif(city,'')) into v_address from listings where id=(p_data->>'listing_id')::uuid;
   end if;
   if nullif(trim(v_address),'') is null then raise exception using errcode='P0001',message='Sélectionnez une propriété du CRM.'; end if;
   v_broker:=(p_data->>'broker')::broker_assignment;
   if v_broker is null or v_broker='unassigned' then raise exception using errcode='P0001',message='Sélectionnez un courtier.'; end if;
   select coalesce(array_agg(value),'{}'::text[]) into v_addons from jsonb_array_elements_text(p_data->'addons');
   if cardinality(v_addons)<>(select count(distinct x) from unnest(v_addons) x) or exists(select 1 from unnest(v_addons) x where not exists(select 1 from sign_inventory_stock s where s.id=x and s.kind='addon')) then raise exception using errcode='P0001',message='Ajouts invalides.'; end if;
   if nullif(p_data->>'sign_type','') is null and not coalesce((p_data->>'has_bac')::boolean,false) and cardinality(v_addons)=0 then raise exception using errcode='P0001',message='Sélectionnez au moins un article.'; end if;
   if p_action='assign' then
     insert into sign_assignments(id,listing_id,transaction_id,address_snapshot,broker,sign_type,has_bac,created_by,updated_by)
     values(v_id,(p_data->>'listing_id')::uuid,(p_data->>'transaction_id')::uuid,v_address,v_broker,nullif(p_data->>'sign_type',''),coalesce((p_data->>'has_bac')::boolean,false),p_actor,p_actor) returning * into v_new;
   else
     update sign_assignments set listing_id=(p_data->>'listing_id')::uuid,transaction_id=(p_data->>'transaction_id')::uuid,address_snapshot=v_address,broker=v_broker,sign_type=nullif(p_data->>'sign_type',''),has_bac=coalesce((p_data->>'has_bac')::boolean,false),version=version+1,updated_at=clock_timestamp(),updated_by=p_actor where id=v_id returning * into v_new;
     delete from sign_assignment_addons where assignment_id=v_id;
   end if;
   insert into sign_assignment_addons(assignment_id,stock_id) select v_id,x from unnest(v_addons) x;
   select * into v_bad from sign_inventory_availability() where available<0 limit 1;
   if found then raise exception using errcode='P0001',message=format('Stock insuffisant : %s. Actualisez les disponibilités.',v_bad.label); end if;
 end if;
 v_after:=to_jsonb(v_new)||jsonb_build_object('addons',(select coalesce(jsonb_agg(stock_id),'[]'::jsonb) from sign_assignment_addons where assignment_id=v_id));
 insert into sign_inventory_events(assignment_id,action,before_data,after_data,created_by) values(v_id,p_action,v_before,v_after,p_actor);
 return jsonb_build_object('id',v_id);
end;
$$;


create or replace function public.sign_inventory_assignments(p_returned boolean default false,p_search text default '',p_broker text default '',p_page integer default 0)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with enriched as (
   select a.*,case when l.id is null then coalesce(tr.address,a.address_snapshot) else concat_ws(', ',concat_ws(' ',nullif(l.civic_number,''),l.address),nullif(l.apartment,''),nullif(l.city,'')) end address,
     initcap(a.broker::text) broker_label,t.label sign_label,
     (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'label',s.label) order by s.label),'[]'::jsonb) from sign_assignment_addons aa join sign_inventory_stock s on s.id=aa.stock_id where aa.assignment_id=a.id) addons
   from sign_assignments a left join listings l on l.id=a.listing_id left join transactions tr on tr.id=a.transaction_id left join sign_inventory_types t on t.id=a.sign_type
   where (a.returned_at is not null)=p_returned and (p_broker='' or a.broker::text=p_broker)
 ), filtered as (
   select * from enriched where public.sign_inventory_address_matches(address,p_search) or public.sign_inventory_address_matches(address_snapshot,p_search)
 ), page as (select * from filtered order by created_at desc,id limit 50 offset least(greatest(p_page,0),100000)*50)
 select jsonb_build_object('data',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from page p),'count',(select count(*) from filtered));
$$;

create function public.sign_inventory_properties(p_search text default '') returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with properties as (
   select id,'listing'::text source,broker::text,status::text,concat_ws(', ',concat_ws(' ',nullif(civic_number,''),address),nullif(apartment,''),nullif(city,'')) address,updated_at from listings
   union all
   select id,'transaction',broker::text,status::text,address,updated_at from transactions
 ), enriched as (
   select p.*,coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('address',a.address_snapshot,'broker_label',initcap(a.broker::text),'sign_label',t.label,'addons',
     (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'label',s.label)),'[]'::jsonb) from sign_assignment_addons aa join sign_inventory_stock s on s.id=aa.stock_id where aa.assignment_id=a.id)) order by a.created_at desc)
     from sign_assignments a left join sign_inventory_types t on t.id=a.sign_type
     where a.returned_at is null and ((p.source='listing' and a.listing_id=p.id) or (p.source='transaction' and a.transaction_id=p.id)
       or public.sign_inventory_address_key(a.address_snapshot)=public.sign_inventory_address_key(p.address))), '[]'::jsonb) active_assignments
   from properties p where public.sign_inventory_address_matches(p.address,p_search)
 ), selected as (select * from enriched order by (jsonb_array_length(active_assignments)>0) desc,updated_at desc,id limit 30)
 select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from selected p;
$$;

revoke all on function public.sign_inventory_properties(text) from public,anon;
grant execute on function public.sign_inventory_properties(text) to authenticated,service_role;
