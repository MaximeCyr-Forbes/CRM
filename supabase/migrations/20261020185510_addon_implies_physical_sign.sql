-- One physical sign per active assignment, even when its type was not recorded.
-- EXISTS avoids counting each addon separately. BAC-only remains independent.
create or replace function public.sign_inventory_availability()
returns table(id text, kind text, broker text, label text, total integer, used bigint, available bigint, version integer)
language sql stable set search_path to 'public', 'pg_temp'
as $function$
 with stocks as (
   select 'sign:'||b::text id,'sign' kind,b::text broker,initcap(b::text) label,coalesce(s.total,0) total,coalesce(s.version,0) version
   from unnest(enum_range(null::public.broker_assignment)) b left join sign_inventory_stock s on s.id='sign:'||b::text where b::text<>'unassigned'
   union all select s.id,s.kind,null::text,s.label,s.total,s.version from sign_inventory_stock s where s.kind<>'sign'
 ), counts as (
   select s.*,case when s.kind='sign' then (
     select count(*) from sign_assignments a
     where a.returned_at is null and a.broker::text=s.broker
       and (a.sign_type is not null or exists (
         select 1 from sign_assignment_addons aa where aa.assignment_id=a.id
       ))
   )
     when s.kind='bac' then (select count(*) from sign_assignments a where a.returned_at is null and a.has_bac)
     else (select count(*) from sign_assignment_addons aa join sign_assignments a on a.id=aa.assignment_id where a.returned_at is null and aa.stock_id=s.id) end used
   from stocks s
 ) select c.id,c.kind,c.broker,c.label,c.total,c.used,c.total-c.used,c.version from counts c order by c.kind,c.label;
$function$;
