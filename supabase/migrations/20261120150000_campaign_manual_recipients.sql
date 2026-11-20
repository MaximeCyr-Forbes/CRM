begin;

create table public.custom_email_campaign_manual_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.custom_email_campaigns(id) on delete set null,
  email text not null check (length(email) between 3 and 320 and email !~ '[[:space:]<> ,;:]' and email ~ '^[^@]+@[^@]+\.[^@]+$'),
  email_normalized text generated always as (lower(btrim(email))) stored,
  first_name text not null default '' check (length(first_name)<=120),
  last_name text not null default '' check (length(last_name)<=120),
  broker public.broker_assignment check (broker <> 'unassigned'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);
create unique index campaign_manual_active_email on public.custom_email_campaign_manual_recipients(campaign_id,email_normalized) where removed_at is null;
create index campaign_manual_campaign on public.custom_email_campaign_manual_recipients(campaign_id);
alter table public.custom_email_campaign_manual_recipients enable row level security;
revoke all on public.custom_email_campaign_manual_recipients from public,anon,authenticated;
grant select,insert,update on public.custom_email_campaign_manual_recipients to service_role;
grant select,insert,update on public.custom_email_campaign_manual_recipients to authenticated;
create policy crm_member_access on public.custom_email_campaign_manual_recipients to authenticated
  using ((select crm_auth.has_functional_access())) with check ((select crm_auth.has_functional_access()));
create trigger crm_audit after insert or update on public.custom_email_campaign_manual_recipients
  for each row execute function crm_auth.audit_change();

alter table public.custom_email_manual_deliveries alter column contact_id drop not null;
alter table public.custom_email_manual_deliveries add column manual_recipient_id uuid references public.custom_email_campaign_manual_recipients(id);
alter table public.custom_email_manual_deliveries add constraint campaign_delivery_recipient check (num_nonnulls(contact_id,manual_recipient_id)=1);
create unique index campaign_delivery_manual_identity on public.custom_email_manual_deliveries(step_id,manual_recipient_id) where manual_recipient_id is not null;
create index campaign_delivery_mailbox on public.custom_email_manual_deliveries(step_id,lower(btrim(recipient_email)));

-- Whole editor save: one transaction, one row lock, stale editors fail before any write.
create function public.save_custom_campaign_editor(p_id uuid,p_expected timestamptz,p_campaign jsonb,p_contacts uuid[],p_manual jsonb,p_steps jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare c public.custom_email_campaigns; r jsonb; s jsonb; n integer:=0; sid uuid;
begin
  if current_user='authenticated' and not (select crm_auth.has_functional_access()) then raise exception 'CRM_MEMBER_REQUIRED' using errcode='42501'; end if;
  if p_expected is null then
    insert into public.custom_email_campaigns(id,name) values(p_id,p_campaign->>'name') returning * into c;
  else
    select * into c from public.custom_email_campaigns where id=p_id for update;
    if not found or c.updated_at<>p_expected then raise exception 'CAMPAIGN_CONFLICT' using errcode='40001'; end if;
  end if;
  update public.custom_email_campaigns set name=p_campaign->>'name',status='draft',
    execution_mode=p_campaign->>'executionMode',sender_strategy=p_campaign->>'senderStrategy',
    fixed_broker=(p_campaign->>'fixedBroker')::public.broker_assignment,fallback_broker=(p_campaign->>'fallbackBroker')::public.broker_assignment,
    start_date=(p_campaign->>'startDate')::date,send_hour=(p_campaign->>'sendHour')::integer,send_minute=(p_campaign->>'sendMinute')::integer
    where id=p_id;
  delete from public.custom_email_campaign_contacts where campaign_id=p_id and not(contact_id=any(p_contacts));
  insert into public.custom_email_campaign_contacts(campaign_id,contact_id) select p_id,unnest(p_contacts) on conflict do nothing;
  -- Retire first, allowing atomic address swaps; historical delivery snapshots never change.
  update public.custom_email_campaign_manual_recipients set removed_at=now(),updated_at=now() where campaign_id=p_id and removed_at is null;
  for r in select value from jsonb_array_elements(p_manual) loop
    if exists(select 1 from public.custom_email_campaign_manual_recipients where id=(r->>'id')::uuid and campaign_id is distinct from p_id) then raise exception 'RECIPIENT_SCOPE'; end if;
    insert into public.custom_email_campaign_manual_recipients(id,campaign_id,email,first_name,last_name,broker)
      values((r->>'id')::uuid,p_id,r->>'email',r->>'firstName',r->>'lastName',(r->>'broker')::public.broker_assignment)
      on conflict(id) do update set email=excluded.email,first_name=excluded.first_name,last_name=excluded.last_name,broker=excluded.broker,removed_at=null,updated_at=now();
  end loop;
  delete from public.custom_email_campaign_steps where campaign_id=p_id and id not in (select (value->>'id')::uuid from jsonb_array_elements(p_steps));
  update public.custom_email_campaign_steps set step_order=step_order+100000 where campaign_id=p_id;
  for s in select value from jsonb_array_elements(p_steps) loop
    n:=n+1; sid:=(s->>'id')::uuid;
    if exists(select 1 from public.custom_email_campaign_steps where id=sid and campaign_id<>p_id) then raise exception 'STEP_SCOPE'; end if;
    insert into public.custom_email_campaign_steps(id,campaign_id,step_order,delay_days_after_previous,subject_template,body_template)
      values(sid,p_id,n,case when n=1 then 0 else (s->>'delayDaysAfterPrevious')::integer end,s->>'subjectTemplate',s->>'bodyTemplate')
      on conflict(id) do update set step_order=n,delay_days_after_previous=excluded.delay_days_after_previous,subject_template=excluded.subject_template,body_template=excluded.body_template;
  end loop;
  update public.custom_email_campaigns set status=p_campaign->>'status' where id=p_id;
  return p_id;
end $$;
revoke all on function public.save_custom_campaign_editor(uuid,timestamptz,jsonb,uuid[],jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_custom_campaign_editor(uuid,timestamptz,jsonb,uuid[],jsonb,jsonb) to service_role;
grant execute on function public.save_custom_campaign_editor(uuid,timestamptz,jsonb,uuid[],jsonb,jsonb) to authenticated;

-- Serialize claims by step, including retries and cross-source mailbox collisions.
create function public.claim_custom_campaign_recipient(p_row jsonb,p_retry boolean)
returns uuid language plpgsql security invoker set search_path=public as $$
declare d public.custom_email_manual_deliveries; found_id uuid; matches integer;
begin
  if current_user='authenticated' and not (select crm_auth.has_functional_access()) then raise exception 'CRM_MEMBER_REQUIRED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_row->>'step_id',0));
  select count(*),min(id::text)::uuid into matches,found_id from public.custom_email_manual_deliveries
    where step_id=(p_row->>'step_id')::uuid and
    (lower(btrim(recipient_email))=lower(btrim(p_row->>'recipient_email'))
      or contact_id=(p_row->>'contact_id')::uuid or manual_recipient_id=(p_row->>'manual_recipient_id')::uuid);
  if matches>0 then
    select * into d from public.custom_email_manual_deliveries where id=found_id for update;
    if matches<>1 or not p_retry or d.status<>'failed' or d.attempt_key=(p_row->>'attempt_key')::uuid
      or d.recipient_email<>p_row->>'recipient_email'
      or d.contact_id is distinct from (p_row->>'contact_id')::uuid
      or d.manual_recipient_id is distinct from (p_row->>'manual_recipient_id')::uuid then return null; end if;
    update public.custom_email_manual_deliveries set status=p_row->>'status',attempt_key=(p_row->>'attempt_key')::uuid,
      batch_id=(p_row->>'batch_id')::uuid,broker=(p_row->>'broker')::public.broker_assignment,error=p_row->>'error',updated_at=now() where id=d.id;
    return d.id;
  end if;
  if p_retry then return null; end if;
  insert into public.custom_email_manual_deliveries(batch_id,campaign_id,step_id,contact_id,manual_recipient_id,broker,recipient_email,status,attempt_key,error)
    values((p_row->>'batch_id')::uuid,(p_row->>'campaign_id')::uuid,(p_row->>'step_id')::uuid,(p_row->>'contact_id')::uuid,
      (p_row->>'manual_recipient_id')::uuid,(p_row->>'broker')::public.broker_assignment,p_row->>'recipient_email',p_row->>'status',(p_row->>'attempt_key')::uuid,p_row->>'error') returning id into found_id;
  return found_id;
end $$;
revoke all on function public.claim_custom_campaign_recipient(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.claim_custom_campaign_recipient(jsonb,boolean) to service_role;
grant execute on function public.claim_custom_campaign_recipient(jsonb,boolean) to authenticated;
commit;
