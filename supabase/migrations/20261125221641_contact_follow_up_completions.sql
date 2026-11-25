begin;
-- Retain the contact UUID even if the contact is later deleted; never cascade away an audit.
create table public.contact_follow_up_completions (
 id uuid primary key default gen_random_uuid(),
 contact_id uuid not null,
 scheduled_for date not null,
 scheduled_version timestamptz not null,
 completed_at timestamptz not null default clock_timestamp(),
 completed_by_member_id uuid not null references public.crm_members(id),
 completed_by_broker text not null,
 contact_broker text not null,
 reverted_at timestamptz,
 reverted_by_member_id uuid references public.crm_members(id),
 reverted_by_broker text,
 created_at timestamptz not null default clock_timestamp(),
 google_event_id text,
 google_event_broker text,
 google_calendar_id text,
 google_sync_status text not null check (google_sync_status in ('pending','synced','error')),
 google_sync_error text,
 unique(contact_id,scheduled_version),
 check ((reverted_at is null) = (reverted_by_member_id is null))
);
create index contact_follow_up_history on public.contact_follow_up_completions(contact_id,completed_at desc);
create index contact_follow_up_actor on public.contact_follow_up_completions(completed_by_member_id);
create index contact_follow_up_reverter on public.contact_follow_up_completions(reverted_by_member_id);
alter table public.contact_follow_up_completions enable row level security;
revoke all on public.contact_follow_up_completions from public,anon,authenticated;
grant select on public.contact_follow_up_completions to authenticated,service_role;
grant update(google_sync_status,google_sync_error) on public.contact_follow_up_completions to service_role;
create policy follow_up_history_read on public.contact_follow_up_completions for select to authenticated
 using (exists(select 1 from public.contacts c where c.id=contact_id));

create function crm_auth.complete_contact_follow_up(p_contact_id uuid,p_scheduled_for date,p_version timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m jsonb; c public.contacts; e public.contact_follow_up_completions; cal text;
begin
 m:=crm_auth.member_identity();
 if m is null then raise exception 'FOLLOWUP_FORBIDDEN' using errcode='42501'; end if;
 select * into c from public.contacts where id=p_contact_id for update;
 if not found or not crm_auth.can_access(c.broker::text) then raise exception 'FOLLOWUP_FORBIDDEN' using errcode='42501'; end if;
 select * into e from public.contact_follow_up_completions where contact_id=c.id and scheduled_version=p_version;
 if found then
   if e.scheduled_for=p_scheduled_for and e.reverted_at is null then return to_jsonb(e); end if;
   raise exception 'FOLLOWUP_STALE';
 end if;
 if c.next_follow_up_date is null or c.next_follow_up_date is distinct from p_scheduled_for or c.updated_at is distinct from p_version then raise exception 'FOLLOWUP_STALE'; end if;
 select calendar_id into cal from public.google_calendar_connections where broker=c.google_calendar_event_broker;
 insert into public.contact_follow_up_completions(contact_id,scheduled_for,scheduled_version,completed_by_member_id,completed_by_broker,contact_broker,google_event_id,google_event_broker,google_calendar_id,google_sync_status)
 values(c.id,c.next_follow_up_date,c.updated_at,(m->>'member_id')::uuid,m->>'broker',c.broker,c.google_calendar_event_id,c.google_calendar_event_broker,cal,case when c.google_calendar_event_id is null then 'synced' else 'pending' end) returning * into e;
 -- Detach exactly this event so a later scheduled follow-up gets a new event, even if Google is down.
 update public.contacts set next_follow_up_date=null,google_calendar_event_id=null,google_calendar_event_broker=null,
   google_calendar_sync_status='synced',google_calendar_last_error=null where id=c.id;
 return to_jsonb(e);
end; $$;

create function crm_auth.revert_contact_follow_up(p_contact_id uuid,p_completion_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m jsonb; c public.contacts; e public.contact_follow_up_completions; restored boolean:=false;
begin
 m:=crm_auth.member_identity();
 if m is null then raise exception 'FOLLOWUP_FORBIDDEN' using errcode='42501'; end if;
 select * into c from public.contacts where id=p_contact_id for update;
 if not found or not crm_auth.can_access(c.broker::text) then raise exception 'FOLLOWUP_FORBIDDEN' using errcode='42501'; end if;
 select * into e from public.contact_follow_up_completions where id=p_completion_id and contact_id=c.id for update;
 if not found then raise exception 'FOLLOWUP_NOT_FOUND'; end if;
 if e.reverted_at is not null then return jsonb_build_object('completion',to_jsonb(e),'restored',false); end if;
 if c.next_follow_up_date is null and not exists(select 1 from public.contact_follow_up_completions x where x.contact_id=c.id and x.completed_at>e.completed_at) then
   update public.contacts set next_follow_up_date=e.scheduled_for,google_calendar_sync_status='pending',google_calendar_last_error=null where id=c.id;
   restored:=true;
 end if;
 update public.contact_follow_up_completions set reverted_at=clock_timestamp(),reverted_by_member_id=(m->>'member_id')::uuid,reverted_by_broker=m->>'broker' where id=e.id returning * into e;
 return jsonb_build_object('completion',to_jsonb(e),'restored',restored);
end; $$;
revoke all on function crm_auth.complete_contact_follow_up(uuid,date,timestamptz),crm_auth.revert_contact_follow_up(uuid,uuid) from public,anon;
grant execute on function crm_auth.complete_contact_follow_up(uuid,date,timestamptz),crm_auth.revert_contact_follow_up(uuid,uuid) to authenticated;
create function public.complete_contact_follow_up(p_contact_id uuid,p_scheduled_for date,p_version timestamptz)
returns jsonb language sql security invoker set search_path='' as $$select crm_auth.complete_contact_follow_up(p_contact_id,p_scheduled_for,p_version);$$;
create function public.revert_contact_follow_up(p_contact_id uuid,p_completion_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select crm_auth.revert_contact_follow_up(p_contact_id,p_completion_id);$$;
revoke all on function public.complete_contact_follow_up(uuid,date,timestamptz),public.revert_contact_follow_up(uuid,uuid) from public,anon;
grant execute on function public.complete_contact_follow_up(uuid,date,timestamptz),public.revert_contact_follow_up(uuid,uuid) to authenticated;
commit;
