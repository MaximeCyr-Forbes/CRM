-- Additive MCP adapter: existing inventory lock, permissions, stock rules and events.
-- The action ledger and stock mutation commit together, including after lost responses.
create function crm_integration.add_inventory_stock(p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 m jsonb; v_kind text; v_id text; v_quantity integer;
 v_stock public.sign_inventory_stock; v_claim jsonb; v_result jsonb; v_action uuid;
begin
 m:=public.crm_mcp_identity();
 if m is null or m->>'role' is distinct from 'admin' or not coalesce((m->>'can_write')::boolean,false) then
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
revoke all on function crm_integration.add_inventory_stock(jsonb) from public,anon,authenticated;
grant execute on function crm_integration.add_inventory_stock(jsonb) to authenticated;
create function public.crm_mcp_add_inventory_stock(p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select crm_integration.add_inventory_stock(p_data); $$;
revoke all on function public.crm_mcp_add_inventory_stock(jsonb) from public,anon,authenticated;
grant execute on function public.crm_mcp_add_inventory_stock(jsonb) to authenticated;
