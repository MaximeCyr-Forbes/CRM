-- All verified active CRM members share business capabilities. Identity, sessions,
-- OAuth consent, technical secrets and immutable audit remain protected.
create or replace function crm_auth.member_identity()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('member_id',m.id,'identity_id',a.id,'auth_user_id',i.user_id,
 'broker',m.broker,'role',m.role,'brokers',jsonb_build_array('france','maxime','sandrine'))
 from crm_auth.verified_google_identity() i
 join public.crm_member_auth_identities a on a.provider=i.provider and a.provider_subject=i.provider_id
   and a.auth_user_id=i.user_id and a.email_normalized=lower(btrim(i.identity_data->>'email'))
 join public.crm_members m on m.id=a.member_id
 join auth.sessions s on s.user_id=i.user_id and s.id::text=auth.jwt()->>'session_id'
 where a.active and m.active and (
  (s.oauth_client_id is null and nullif(auth.jwt()->>'client_id','') is null)
  or exists(select 1 from auth.oauth_consents c join auth.oauth_clients oc on oc.id=c.client_id
    where c.user_id=i.user_id and c.client_id=s.oauth_client_id and c.revoked_at is null
    and oc.deleted_at is null and oc.id::text=auth.jwt()->>'client_id')
 );
$$;

create function crm_auth.has_functional_access() returns boolean
language sql stable security invoker set search_path='' as $$
 select crm_auth.member_identity() is not null;
$$;
revoke all on function crm_auth.has_functional_access() from public,anon;
grant execute on function crm_auth.has_functional_access() to authenticated;
create or replace function crm_auth.can_access(target text) returns boolean
language sql stable security invoker set search_path='' as $$
 select crm_auth.has_functional_access() and coalesce(target,'unassigned') in ('france','maxime','sandrine','unassigned');
$$;
-- Resolve membership once per statement. Broker selection is a UI filter.
alter policy crm_member_access on public.contacts
using ((select crm_auth.has_functional_access())) with check ((select crm_auth.has_functional_access()));
-- Only existing business policies change; no public/anonymous grants.
do $$ declare t text; begin
 foreach t in array array['automatic_email_rules','custom_email_campaigns','custom_email_campaign_steps',
 'custom_email_campaign_contacts','custom_email_manual_batches','sign_inventory_events'] loop
 execute format('alter policy crm_member_access on public.%I using ((select crm_auth.has_functional_access())) with check ((select crm_auth.has_functional_access()))',t);
 end loop;
end; $$;
alter policy crm_recommendation_admin on public.crm_recommendations rename to crm_recommendation_member;
alter policy crm_recommendation_member on public.crm_recommendations
using ((select crm_auth.has_functional_access())) with check ((select crm_auth.has_functional_access()));
create or replace function crm_auth.crm_inventory_write(p_action text,p_data jsonb,p_actor text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m jsonb; target text; old_broker text; listing_broker text; begin
 m:=crm_auth.member_identity();
 if m is null or m->>'broker' is distinct from p_actor or p_action not in ('assign','edit','return','stock') then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;
 if p_action<>'stock' then
  select broker::text into old_broker from public.sign_assignments where id=(p_data->>'id')::uuid;
  if old_broker is not null and not crm_auth.can_access(old_broker) then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;
  if p_action in ('assign','edit') then
   target:=p_data->>'broker';
   select broker::text into listing_broker from public.listings where id=(p_data->>'listing_id')::uuid;
   if target is null or listing_broker is distinct from target or not crm_auth.can_access(target) then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;
  elsif old_broker is null then raise exception 'CRM_NOT_FOUND' using errcode='42501'; end if;
 end if;
 return public.sign_inventory_write(p_action,p_data,m->>'broker');
end; $$;

create or replace function crm_integration.crm_mcp_identity() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m jsonb; t uuid; begin
 if nullif(auth.jwt()->>'client_id','') is null then return null; end if;
 m:=crm_auth.member_identity();
 if m is null then return null; end if;
 select team_id into t from crm_integration.configuration where singleton;
 return m||jsonb_build_object('team_id',t,'actor',m->>'broker','active',true,'can_write',true,
 'can_read_team_accounting',true,'can_manage_recommendations',true);
end; $$;

create or replace function crm_integration.add_inventory_stock(p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 m jsonb; v_kind text; v_id text; v_quantity integer;
 v_stock public.sign_inventory_stock; v_claim jsonb; v_result jsonb; v_action uuid;
begin
 m:=public.crm_mcp_identity();
 if m is null or not coalesce((m->>'can_write')::boolean,false) then
  raise exception 'CRM_FORBIDDEN' using errcode='42501';
 end if;
 if jsonb_typeof(p_data) is distinct from 'object' or exists (
  select 1 from jsonb_object_keys(p_data) k where k not in ('action_id','inventory_type','quantity','broker','addon_type')
 ) then raise exception 'INVENTORY_INVALID_INPUT' using errcode='22023'; end if;
 if jsonb_typeof(p_data->'quantity') is distinct from 'number' then
  raise exception 'INVENTORY_ADDITION_MUST_BE_POSITIVE' using errcode='22023';
 end if;
 if (p_data->>'quantity')::numeric < 1 or trunc((p_data->>'quantity')::numeric) <> (p_data->>'quantity')::numeric then
  raise exception 'INVENTORY_ADDITION_MUST_BE_POSITIVE' using errcode='22023';
 end if;
 if (p_data->>'quantity')::numeric > 100000 then raise exception 'INVENTORY_LIMIT_EXCEEDED' using errcode='22023'; end if;
 v_quantity:=(p_data->>'quantity')::integer;
 v_action:=(p_data->>'action_id')::uuid;
 if v_action is null then raise exception 'INVENTORY_INVALID_INPUT' using errcode='22023'; end if;
 v_kind:=p_data->>'inventory_type';
 if v_kind='sign' then
  if p_data->>'broker' is null or p_data->>'addon_type' is not null then raise exception 'INVENTORY_INVALID_BROKER' using errcode='22023'; end if;
  v_id:='sign:'||(p_data->>'broker');
 elsif v_kind='bac' then
  if p_data->>'broker' is not null or p_data->>'addon_type' is not null then raise exception 'INVENTORY_INVALID_INPUT' using errcode='22023'; end if;
  v_id:='bac';
 elsif v_kind='addon' then
  if p_data->>'broker' is not null or p_data->>'addon_type' is null then raise exception 'INVENTORY_INVALID_ADDON' using errcode='22023'; end if;
  v_id:=p_data->>'addon_type';
 else raise exception 'INVENTORY_INVALID_INPUT' using errcode='22023'; end if;
 -- Same lock as UI stock changes, assignments and returns. Read AFTER locking.
 perform pg_advisory_xact_lock(714203,1);
 v_claim:=public.crm_mcp_begin_action(v_action,'crm_add_sign_inventory_stock',encode(sha256(convert_to(p_data::text,'UTF8')),'hex'));
 if not (v_claim->>'claimed')::boolean then
  if v_claim->>'status'='succeeded' then return (v_claim->'result')||jsonb_build_object('replayed',true); end if;
  raise exception 'MCP_ACTION_KEY_CONFLICT' using errcode='23505';
 end if;
 select * into v_stock from public.sign_inventory_stock where id=v_id and kind=v_kind for update;
 if not found then
  raise exception '%',case when v_kind='sign' then 'INVENTORY_INVALID_BROKER' when v_kind='addon' then 'INVENTORY_INVALID_ADDON' else 'INVENTORY_NOT_FOUND' end using errcode='22023';
 end if;
 if v_stock.total+v_quantity > 100000 then raise exception 'INVENTORY_LIMIT_EXCEEDED' using errcode='22023'; end if;
 -- This narrow adapter never accepts an absolute total or actor from its caller.
 perform public.crm_inventory_write('stock',jsonb_build_object(
  'id',v_id,'version',v_stock.version,'total',v_stock.total+v_quantity,
  'source','chatgpt_mcp','action_id',v_action,'inventory_type',v_kind,
  'quantity',v_quantity,'old_total',v_stock.total,'new_total',v_stock.total+v_quantity
 ),m->>'broker');
 select jsonb_build_object('entity','sign_inventory_stock','id',v_id,'inventory_type',v_kind,
  'quantity',v_quantity,'old_total',v_stock.total,'new_total',s.total,
  'used',s.used,'available',s.available,'actor',m->>'broker','action_id',v_action)
 into v_result from public.sign_inventory_availability() s where s.id=v_id;
 perform public.crm_mcp_finish_action((m->>'member_id')::uuid,v_action,'succeeded',v_result);
 return v_result;
end; $$;

