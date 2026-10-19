-- MCP delegates to the SAME CRM member mapping and RLS. No second user/membership system.
create schema if not exists crm_integration;
revoke all on schema crm_integration from public,anon,authenticated;
grant usage on schema crm_integration to authenticated,service_role;
create table crm_integration.configuration(singleton boolean primary key default true check(singleton),team_id uuid not null default gen_random_uuid());
insert into crm_integration.configuration(singleton) values(true);
alter table crm_integration.configuration enable row level security;
revoke all on crm_integration.configuration from public,anon,authenticated;

create function public.crm_mcp_identity() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m jsonb; t uuid; begin
 if nullif(auth.jwt()->>'client_id','') is null then return null; end if;
 m:=crm_auth.member_identity();
 if m is null then return null; end if;
 select team_id into t from crm_integration.configuration where singleton;
 return m||jsonb_build_object('team_id',t,'actor',m->>'broker','active',true,'can_write',true,
 'can_read_team_accounting',m->>'role'='admin','can_manage_recommendations',m->>'role'='admin');
end; $$;
revoke all on function public.crm_mcp_identity() from public,anon;
grant execute on function public.crm_mcp_identity() to authenticated;

create table crm_integration.actions(
 member_id uuid not null references public.crm_members(id), identity_id uuid not null references public.crm_member_auth_identities(id),
 user_id uuid not null references auth.users(id), action_id uuid not null, tool text not null,payload_hash text not null,
 status text not null check(status in ('started','succeeded','failed','uncertain')),
 entity text,entity_id text,result jsonb,created_at timestamptz not null default now(),finished_at timestamptz,
 source text not null default 'chatgpt_mcp' check(source='chatgpt_mcp'), primary key(member_id,action_id)
);
alter table crm_integration.actions enable row level security;
revoke all on crm_integration.actions from public,anon,authenticated;
grant all on crm_integration.actions to service_role;
create table crm_integration.rate_windows(member_id uuid not null references public.crm_members(id),window_at timestamptz not null,calls integer not null default 0,primary key(member_id,window_at));
alter table crm_integration.rate_windows enable row level security;
revoke all on crm_integration.rate_windows from public,anon,authenticated;
grant all on crm_integration.rate_windows to service_role;
create function public.crm_mcp_rate_limit() returns boolean language plpgsql security definer set search_path='' as $$
declare m jsonb; n integer; begin
 m:=public.crm_mcp_identity();
 if m is null then raise exception 'MCP_FORBIDDEN' using errcode='42501'; end if;
 insert into crm_integration.rate_windows(member_id,window_at,calls) values((m->>'member_id')::uuid,date_trunc('minute',now()),1)
 on conflict(member_id,window_at) do update set calls=crm_integration.rate_windows.calls+1 returning calls into n;
 delete from crm_integration.rate_windows where member_id=(m->>'member_id')::uuid and window_at<now()-interval '1 day';
 return n<=60;
end; $$;
revoke all on function public.crm_mcp_rate_limit() from public,anon;
grant execute on function public.crm_mcp_rate_limit() to authenticated;

create function public.crm_mcp_begin_action(p_action_id uuid,p_tool text,p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m jsonb; prior crm_integration.actions; inserted uuid; begin
 m:=public.crm_mcp_identity();
 if m is null or not (m->>'can_write')::boolean then raise exception 'MCP_FORBIDDEN' using errcode='42501'; end if;
 if p_tool !~ '^crm_[a-z_]{1,80}$' or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'MCP_INVALID_INPUT' using errcode='22023'; end if;
 insert into crm_integration.actions(member_id,identity_id,user_id,action_id,tool,payload_hash,status)
 values((m->>'member_id')::uuid,(m->>'identity_id')::uuid,auth.uid(),p_action_id,p_tool,p_hash,'started')
 on conflict do nothing returning action_id into inserted;
 if inserted is not null then return jsonb_build_object('claimed',true); end if;
 select * into prior from crm_integration.actions where member_id=(m->>'member_id')::uuid and action_id=p_action_id;
 if prior.tool<>p_tool or prior.payload_hash<>p_hash then raise exception 'MCP_ACTION_KEY_CONFLICT' using errcode='23505'; end if;
 return jsonb_build_object('claimed',false,'status',prior.status,'result',prior.result);
end; $$;
revoke all on function public.crm_mcp_begin_action(uuid,text,text) from public,anon;
grant execute on function public.crm_mcp_begin_action(uuid,text,text) to authenticated;

-- Completion is server-only. A bearer client cannot forge successful execution records.
-- Actual row changes are independently audited by the database triggers with the verified actor.
create function public.crm_mcp_finish_action(p_member_id uuid,p_action_id uuid,p_status text,p_result jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('succeeded','failed','uncertain') or octet_length(p_result::text)>4096 then raise exception 'MCP_INVALID_INPUT' using errcode='22023'; end if;
 update crm_integration.actions set status=p_status,entity=p_result->>'entity',entity_id=p_result->>'id',result=p_result,finished_at=now()
 where member_id=p_member_id and action_id=p_action_id and status='started';
end; $$;
revoke all on function public.crm_mcp_finish_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_mcp_finish_action(uuid,uuid,text,jsonb) to service_role;
