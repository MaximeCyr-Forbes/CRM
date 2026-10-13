-- Shared inventory. CRM cookie + signed workspace enforced by the server.
-- Only the narrowly granted RPC can mutate stock/assignments; no client DML.
create table public.sign_inventory_types (
  id text primary key, label text not null unique check(length(label) between 1 and 80)
);
insert into public.sign_inventory_types values ('sale','À vendre'),('sold','Vendu'),('rent','À louer');
create table public.sign_inventory_stock (
  id text primary key,
  kind text not null check(kind in ('sign','addon','bac')),
  broker public.broker_assignment,
  label text not null,
  total integer not null default 0 check(total between 0 and 100000),
  version integer not null default 0 check(version >= 0),
  updated_at timestamptz, updated_by text,
  check ((kind='sign' and broker is not null and broker<>'unassigned' and id='sign:'||broker::text)
    or (kind='addon' and broker is null and id like 'addon:%')
    or (kind='bac' and broker is null and id='bac'))
);
insert into public.sign_inventory_stock(id,kind,broker,label)
  select 'sign:'||b::text,'sign',b,'Pancartes' from unnest(enum_range(null::public.broker_assignment)) b where b::text<>'unassigned';
insert into public.sign_inventory_stock(id,kind,label) values
 ('bac','bac','Boîtes à clés'),('addon:sold','addon','Vendu'),('addon:open-house','addon','Visite libre'),
 ('addon:estimate','addon','Estimation gratuite'),('addon:rent','addon','À louer');
create table public.sign_assignments (
  id uuid primary key,
  listing_id uuid references public.listings(id) on delete set null,
  -- Historical fallback only; the listing remains the canonical address source.
  address_snapshot text not null,
  broker public.broker_assignment not null check(broker<>'unassigned'),
  sign_type text references public.sign_inventory_types(id),
  has_bac boolean not null default false,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default clock_timestamp(), created_by text not null,
  updated_at timestamptz not null default clock_timestamp(), updated_by text not null,
  returned_at timestamptz, returned_by text,
  check ((returned_at is null)=(returned_by is null))
);
create index sign_assignments_listing_idx on public.sign_assignments(listing_id);
create index sign_assignments_broker_idx on public.sign_assignments(broker) where returned_at is null;
create index sign_assignments_order_idx on public.sign_assignments(created_at desc,id);
create index sign_assignments_type_idx on public.sign_assignments(sign_type);
create table public.sign_assignment_addons (
  assignment_id uuid not null references public.sign_assignments(id),
  stock_id text not null references public.sign_inventory_stock(id),
  primary key(assignment_id,stock_id)
);
create index sign_assignment_addons_stock_idx on public.sign_assignment_addons(stock_id);
create table public.sign_inventory_events (
  id bigint generated always as identity primary key,
  assignment_id uuid references public.sign_assignments(id),
  stock_id text references public.sign_inventory_stock(id),
  action text not null check(action in ('assign','edit','return','stock')),
  before_data jsonb, after_data jsonb not null,
  created_at timestamptz not null default clock_timestamp(), created_by text not null
);
create index sign_inventory_events_assignment_idx on public.sign_inventory_events(assignment_id);
create index sign_inventory_events_stock_idx on public.sign_inventory_events(stock_id);

alter table public.sign_inventory_types enable row level security;
alter table public.sign_inventory_stock enable row level security;
alter table public.sign_assignments enable row level security;
alter table public.sign_assignment_addons enable row level security;
alter table public.sign_inventory_events enable row level security;
revoke all on public.sign_inventory_types,public.sign_inventory_stock,public.sign_assignments,public.sign_assignment_addons,public.sign_inventory_events from public,anon,authenticated,service_role;
revoke all on sequence public.sign_inventory_events_id_seq from public,anon,authenticated,service_role;
grant select on public.sign_inventory_types,public.sign_inventory_stock,public.sign_assignments,public.sign_assignment_addons,public.sign_inventory_events to service_role;

create function public.sign_inventory_availability()
returns table(id text,kind text,broker text,label text,total integer,used bigint,available bigint,version integer)
language sql stable security invoker set search_path=public,pg_temp as $$
 with stocks as (
   select 'sign:'||b::text id,'sign' kind,b::text broker,initcap(b::text) label,coalesce(s.total,0) total,coalesce(s.version,0) version
   from unnest(enum_range(null::public.broker_assignment)) b left join sign_inventory_stock s on s.id='sign:'||b::text where b::text<>'unassigned'
   union all select s.id,s.kind,null::text,s.label,s.total,s.version from sign_inventory_stock s where s.kind<>'sign'
 ), counts as (
   select s.*,case when s.kind='sign' then (select count(*) from sign_assignments a where a.returned_at is null and a.broker::text=s.broker and a.sign_type is not null)
     when s.kind='bac' then (select count(*) from sign_assignments a where a.returned_at is null and a.has_bac)
     else (select count(*) from sign_assignment_addons aa join sign_assignments a on a.id=aa.assignment_id where a.returned_at is null and aa.stock_id=s.id) end used
   from stocks s
 ) select c.id,c.kind,c.broker,c.label,c.total,c.used,c.total-c.used,c.version from counts c order by c.kind,c.label;
$$;

create function public.sign_inventory_write(p_action text,p_data jsonb,p_actor text)
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
   select concat_ws(', ',concat_ws(' ',nullif(civic_number,''),address),nullif(apartment,''),nullif(city,'')) into v_address from listings where id=(p_data->>'listing_id')::uuid;
   if not found then raise exception using errcode='P0001',message='Sélectionnez une propriété du CRM.'; end if;
   v_broker:=(p_data->>'broker')::broker_assignment;
   if v_broker is null or v_broker='unassigned' then raise exception using errcode='P0001',message='Sélectionnez un courtier.'; end if;
   select coalesce(array_agg(value),'{}'::text[]) into v_addons from jsonb_array_elements_text(p_data->'addons');
   if cardinality(v_addons)<>(select count(distinct x) from unnest(v_addons) x) or exists(select 1 from unnest(v_addons) x where not exists(select 1 from sign_inventory_stock s where s.id=x and s.kind='addon')) then raise exception using errcode='P0001',message='Ajouts invalides.'; end if;
   if nullif(p_data->>'sign_type','') is null and not coalesce((p_data->>'has_bac')::boolean,false) and cardinality(v_addons)=0 then raise exception using errcode='P0001',message='Sélectionnez au moins un article.'; end if;
   if p_action='assign' then
     insert into sign_assignments(id,listing_id,address_snapshot,broker,sign_type,has_bac,created_by,updated_by)
     values(v_id,(p_data->>'listing_id')::uuid,v_address,v_broker,nullif(p_data->>'sign_type',''),coalesce((p_data->>'has_bac')::boolean,false),p_actor,p_actor) returning * into v_new;
   else
     update sign_assignments set listing_id=(p_data->>'listing_id')::uuid,address_snapshot=v_address,broker=v_broker,sign_type=nullif(p_data->>'sign_type',''),has_bac=coalesce((p_data->>'has_bac')::boolean,false),version=version+1,updated_at=clock_timestamp(),updated_by=p_actor where id=v_id returning * into v_new;
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

create function public.sign_inventory_listings(p_search text default '') returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) from (
   select id,broker,status,concat_ws(', ',concat_ws(' ',nullif(civic_number,''),address),nullif(apartment,''),nullif(city,'')) address
   from listings where concat_ws(' ',civic_number,address,apartment,city) ilike '%'||left(p_search,160)||'%'
   order by case when status in ('active','coming_soon','offer_received','conditional','preparation') then 0 else 1 end,updated_at desc,id limit 30
 ) l;
$$;
create function public.sign_inventory_assignments(p_returned boolean default false,p_search text default '',p_broker text default '',p_page integer default 0)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with enriched as (
   select a.*,case when l.id is null then a.address_snapshot else concat_ws(', ',concat_ws(' ',nullif(l.civic_number,''),l.address),nullif(l.apartment,''),nullif(l.city,'')) end address,
     initcap(a.broker::text) broker_label,t.label sign_label,
     (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'label',s.label) order by s.label),'[]'::jsonb) from sign_assignment_addons aa join sign_inventory_stock s on s.id=aa.stock_id where aa.assignment_id=a.id) addons
   from sign_assignments a left join listings l on l.id=a.listing_id left join sign_inventory_types t on t.id=a.sign_type
   where (a.returned_at is not null)=p_returned and (p_broker='' or a.broker::text=p_broker)
 ), filtered as (
   select * from enriched where address ilike '%'||left(p_search,160)||'%' or address_snapshot ilike '%'||left(p_search,160)||'%'
 ), page as (select * from filtered order by created_at desc,id limit 50 offset least(greatest(p_page,0),100000)*50)
 select jsonb_build_object('data',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from page p),'count',(select count(*) from filtered));
$$;
revoke all on function public.sign_inventory_availability(),public.sign_inventory_write(text,jsonb,text),public.sign_inventory_listings(text),public.sign_inventory_assignments(boolean,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.sign_inventory_availability(),public.sign_inventory_write(text,jsonb,text),public.sign_inventory_listings(text),public.sign_inventory_assignments(boolean,text,text,integer) to service_role;
