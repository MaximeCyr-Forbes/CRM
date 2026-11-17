-- No business table is changed. No cycle is seeded: activation requires evidence.
create table public.assistant_billing_cycles (
 id uuid primary key default gen_random_uuid(),
 starts_at timestamptz not null, expires_at timestamptz not null,
 verified_until timestamptz not null, verified_at timestamptz not null default now(),
 organization_id text not null, project_id text not null, key_sha256 text not null,
 promotional_credit_usd numeric(12,6) not null check(promotional_credit_usd>0),
 budget_usd numeric(12,6) not null default 10 check(budget_usd>0 and budget_usd<=10),
 no_paid_fallback boolean not null default false,
 auto_recharge_off boolean not null default false,
 privacy_reviewed boolean not null default false,
 model_verified boolean not null default false,
 enabled boolean not null default false,
 check(expires_at>starts_at), check(verified_until<=expires_at), check(verified_until<=verified_at+interval '24 hours'),
 check(budget_usd<=promotional_credit_usd)
);
create unique index assistant_one_enabled_cycle on public.assistant_billing_cycles(enabled) where enabled;
create table public.assistant_usage (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.crm_members(id),
 request_id uuid not null unique, model text not null check(model='gpt-6-luna'),
 input_tokens integer not null default 0 check(input_tokens>=0),
 output_tokens integer not null default 0 check(output_tokens>=0),
 estimated_usd numeric(12,6) not null default 0 check(estimated_usd>=0),
 reserved_usd numeric(12,6) not null default 0.03 check(reserved_usd=0.03),
 status text not null default 'reserved' check(status in ('reserved','completed','uncertain')),
 billing_cycle_id uuid not null references public.assistant_billing_cycles(id),
 created_at timestamptz not null default now()
);
create index assistant_usage_cycle on public.assistant_usage(billing_cycle_id);
create index assistant_usage_member_time on public.assistant_usage(member_id,created_at);
alter table public.assistant_billing_cycles enable row level security;
alter table public.assistant_usage enable row level security;
revoke all on public.assistant_billing_cycles,public.assistant_usage from public,anon,authenticated;
grant select,insert,update on public.assistant_billing_cycles,public.assistant_usage to service_role;

create function public.assistant_reserve(p_member_id uuid,p_request_id uuid,p_key_sha256 text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.assistant_billing_cycles; used numeric; day_start timestamptz;
begin
 perform pg_advisory_xact_lock(714211,1);
 if not exists(select 1 from public.crm_members where id=p_member_id and active) then raise exception 'ASSISTANT_DENIED'; end if;
 select * into c from public.assistant_billing_cycles where enabled for update;
 if c.id is null or now()<c.starts_at or now()>=c.expires_at or now()>=c.verified_until
 or not c.no_paid_fallback or not c.auto_recharge_off or not c.privacy_reviewed or not c.model_verified
 or c.key_sha256<>p_key_sha256 then raise exception 'ASSISTANT_DISABLED'; end if;
 if exists(select 1 from public.assistant_usage where request_id=p_request_id) then raise exception 'ASSISTANT_DUPLICATE'; end if;
 -- Crashed/ambiguous calls retain their complete reservation. Never auto-refund.
 update public.assistant_usage set status='uncertain' where status='reserved' and created_at<now()-interval '5 minutes';
 if exists(select 1 from public.assistant_usage where member_id=p_member_id and status='reserved')
 or (select count(*) from public.assistant_usage where status='reserved')>=3 then raise exception 'ASSISTANT_BUSY'; end if;
 day_start:=date_trunc('day',now() at time zone 'America/Toronto') at time zone 'America/Toronto';
 if (select count(*) from public.assistant_usage where member_id=p_member_id and created_at>=day_start)>=20
 or (select count(*) from public.assistant_usage where created_at>=day_start)>=60 then raise exception 'ASSISTANT_QUOTA'; end if;
 select coalesce(sum(case when status='completed' then estimated_usd else greatest(reserved_usd,estimated_usd) end),0)
 into used from public.assistant_usage where billing_cycle_id=c.id;
 if used+0.03>c.budget_usd then raise exception 'ASSISTANT_BUDGET'; end if;
 insert into public.assistant_usage(member_id,request_id,model,billing_cycle_id) values(p_member_id,p_request_id,'gpt-6-luna',c.id);
 return jsonb_build_object('cycleId',c.id,'organizationId',c.organization_id,'projectId',c.project_id,'expiresAt',least(c.expires_at,c.verified_until));
end; $$;
create function public.assistant_finish(p_request_id uuid,p_input integer,p_output integer,p_complete boolean)
returns void language plpgsql security invoker set search_path='' as $$
declare cost numeric; cycle_id uuid; begin
 perform pg_advisory_xact_lock(714211,1);
 if p_input<0 or p_output<0 then raise exception 'ASSISTANT_USAGE_INVALID'; end if;
 cost:=(p_input::numeric*0.125+p_output::numeric*0.5)/1000000;
 update public.assistant_usage set input_tokens=p_input,output_tokens=p_output,estimated_usd=cost,
 status=case when p_complete and cost<=reserved_usd then 'completed' else 'uncertain' end
 where request_id=p_request_id and status in ('reserved','uncertain') returning billing_cycle_id into cycle_id;
 if cost>0.03 then update public.assistant_billing_cycles set enabled=false where id=cycle_id; end if;
end; $$;
revoke all on function public.assistant_reserve(uuid,uuid,text),public.assistant_finish(uuid,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.assistant_reserve(uuid,uuid,text),public.assistant_finish(uuid,integer,integer,boolean) to service_role;

create function public.assistant_permit(p_request_id uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.assistant_usage u join public.assistant_billing_cycles c on c.id=u.billing_cycle_id
 join public.crm_members m on m.id=u.member_id
 where u.request_id=p_request_id and u.status='reserved' and m.active and c.enabled
 and c.no_paid_fallback and c.auto_recharge_off and c.privacy_reviewed and c.model_verified
 and now()>=c.starts_at and now()<c.expires_at and now()<c.verified_until);
$$;
revoke all on function public.assistant_permit(uuid) from public,anon,authenticated;
grant execute on function public.assistant_permit(uuid) to service_role;
