-- Keep privileged implementations in non-exposed schemas; public RPCs are invoker-only adapters.
alter function public.crm_bind_google_identity() set schema crm_auth;
create function public.crm_bind_google_identity() returns jsonb language sql security invoker set search_path='' as $$ select crm_auth.crm_bind_google_identity(); $$;
revoke all on function public.crm_bind_google_identity() from public,anon;
grant execute on function public.crm_bind_google_identity() to authenticated;

alter function public.crm_inventory_availability() set schema crm_auth;
create function public.crm_inventory_availability()
returns table(id text,kind text,broker text,label text,total integer,used bigint,available bigint,version integer)
language sql stable security invoker set search_path='' as $$ select * from crm_auth.crm_inventory_availability(); $$;
revoke all on function public.crm_inventory_availability() from public,anon;
grant execute on function public.crm_inventory_availability() to authenticated;

alter function public.crm_inventory_write(text,jsonb,text) set schema crm_auth;
create function public.crm_inventory_write(p_action text,p_data jsonb,p_actor text) returns jsonb language sql security invoker set search_path='' as $$ select crm_auth.crm_inventory_write(p_action,p_data,p_actor); $$;
revoke all on function public.crm_inventory_write(text,jsonb,text) from public,anon;
grant execute on function public.crm_inventory_write(text,jsonb,text) to authenticated;

alter function public.crm_mcp_identity() set schema crm_integration;
create function public.crm_mcp_identity() returns jsonb language sql stable security invoker set search_path='' as $$ select crm_integration.crm_mcp_identity(); $$;
revoke all on function public.crm_mcp_identity() from public,anon;
grant execute on function public.crm_mcp_identity() to authenticated;

alter function public.crm_mcp_rate_limit() set schema crm_integration;
create function public.crm_mcp_rate_limit() returns boolean language sql security invoker set search_path='' as $$ select crm_integration.crm_mcp_rate_limit(); $$;
revoke all on function public.crm_mcp_rate_limit() from public,anon;
grant execute on function public.crm_mcp_rate_limit() to authenticated;

alter function public.crm_mcp_begin_action(uuid,text,text) set schema crm_integration;
create function public.crm_mcp_begin_action(p_action_id uuid,p_tool text,p_hash text) returns jsonb language sql security invoker set search_path='' as $$ select crm_integration.crm_mcp_begin_action(p_action_id,p_tool,p_hash); $$;
revoke all on function public.crm_mcp_begin_action(uuid,text,text) from public,anon;
grant execute on function public.crm_mcp_begin_action(uuid,text,text) to authenticated;
