begin;
create temporary table purchase_counts on commit drop as select (select count(*) from public.contacts) contacts,(select count(*) from public.transactions) transactions;
create table public.purchase_anniversary_greetings (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id),
  contact_id uuid not null references public.contacts(id),
  occurrence_date date not null,
  status text not null check(status in ('manual_done','manual_sending','manual_email_sent','auto_sending','auto_email_sent','failed','uncertain')),
  sender_broker public.broker_assignment check(sender_broker <> 'unassigned'),
  gmail_message_id text,
  error_message text,
  acted_by text,
  automatic_attempted_at timestamptz,
  attempt_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(transaction_id,contact_id,occurrence_date)
);
create index purchase_greetings_today_idx on public.purchase_anniversary_greetings(occurrence_date);
alter table public.purchase_anniversary_greetings enable row level security;
revoke all on public.purchase_anniversary_greetings from public,anon,authenticated;
grant select,insert,update on public.purchase_anniversary_greetings to service_role;
create trigger set_purchase_greetings_updated_at before update on public.purchase_anniversary_greetings
for each row execute function public.set_updated_at();

-- A row lock serializes Done/manual/cron, including the first insert.
-- Sending/uncertain claims are never recycled: Gmail may have accepted the email.
create function public.claim_purchase_anniversary_greeting(p_transaction_id uuid,p_contact_id uuid,p_occurrence date,p_action text,p_actor text)
returns setof public.purchase_anniversary_greetings language plpgsql security invoker set search_path=public as $$
declare t public.transactions; c public.contacts; g public.purchase_anniversary_greetings; v_today date := (now() at time zone 'America/Toronto')::date;
  v_birthday date; v_status text;
begin
  if p_action not in ('done','manual','auto') or p_occurrence<>v_today then return; end if;
  select * into t from public.transactions where id=p_transaction_id for update;
  if not found or t.type<>'purchase' or t.purchase_finalized_at is null or t.notary_date is null
    or extract(year from t.notary_date)>=extract(year from v_today) then return; end if;
  select * into c from public.contacts where id=p_contact_id for update;
  if not found then return; end if;
  perform 1 from public.transaction_contacts where transaction_id=p_transaction_id and contact_id=p_contact_id for update;
  if not found then return; end if;
  -- Last day of February observes leap-day birthdays in non-leap years.
  v_birthday := make_date(extract(year from v_today)::int,extract(month from t.notary_date)::int,1);
  v_birthday := v_birthday + (least(extract(day from t.notary_date)::int,extract(day from (v_birthday + interval '1 month - 1 day'))::int)-1);
  if v_birthday<>v_today then return; end if;
  if p_action='auto' and ((now() at time zone 'America/Toronto')::time < time '17:00'
    or not exists(select 1 from public.automatic_email_rules where rule_type='purchase_anniversary' and trigger_config @> '{"purchaseAnniversaryFallbackEnabled":true}')) then return; end if;
  select * into g from public.purchase_anniversary_greetings where transaction_id=p_transaction_id and contact_id=p_contact_id and occurrence_date=p_occurrence;
  if found and (g.status<>'failed' or (p_action='auto' and g.automatic_attempted_at is not null)) then return; end if;
  v_status := case p_action when 'done' then 'manual_done' when 'manual' then 'manual_sending' else 'auto_sending' end;
  return query insert into public.purchase_anniversary_greetings(transaction_id,contact_id,occurrence_date,status,acted_by,automatic_attempted_at,completed_at)
  values(p_transaction_id,p_contact_id,p_occurrence,v_status,p_actor,case when p_action='auto' then now() end,case when p_action='done' then now() end)
  on conflict(transaction_id,contact_id,occurrence_date) do update set status=v_status,acted_by=p_actor,attempt_token=gen_random_uuid(),error_message=null,
    automatic_attempted_at=coalesce(purchase_anniversary_greetings.automatic_attempted_at,excluded.automatic_attempted_at),completed_at=excluded.completed_at
  returning *;
end;
$$;
revoke execute on function public.claim_purchase_anniversary_greeting(uuid,uuid,date,text,text) from public,anon,authenticated;
grant execute on function public.claim_purchase_anniversary_greeting(uuid,uuid,date,text,text) to service_role;

-- Update settings without resurrecting a stale switch from another browser tab.
create function public.update_purchase_anniversary_rule(p_id uuid,p_values jsonb,p_enabled boolean default null)
returns setof public.automatic_email_rules language plpgsql security invoker set search_path=public as $$
declare v_rule public.automatic_email_rules; v_enabled boolean; v_subject text; v_body text;
begin
  select * into v_rule from public.automatic_email_rules where id=p_id and rule_type='purchase_anniversary' for update;
  if not found then return; end if;
  v_enabled := coalesce(p_enabled,(v_rule.trigger_config->>'purchaseAnniversaryFallbackEnabled')::boolean,false);
  v_subject := coalesce(p_values->>'subject_template',v_rule.subject_template);
  v_body := coalesce(p_values->>'body_template',v_rule.body_template);
  if v_enabled and (
    (case when p_values ? 'default_broker' then p_values->>'default_broker' else v_rule.default_broker::text end) is null
    or trim(v_subject)='' or trim(v_body)=''
    or regexp_replace(v_subject || v_body,'\{\{\s*(firstName|lastName|fullName|purchaseDate)\s*\}\}','','g') ~ '(\{\{|\}\})'
  ) then raise exception 'Configuration Anniversaire d’achat incomplète'; end if;
  return query update public.automatic_email_rules r set
    name=coalesce(p_values->>'name',r.name),
    execution_mode=coalesce(p_values->>'execution_mode',r.execution_mode),
    send_hour=17,send_minute=0,
    status=coalesce(p_values->>'status',r.status),
    default_broker=case when p_values ? 'default_broker' then (p_values->>'default_broker')::public.broker_assignment else r.default_broker end,
    subject_template=coalesce(p_values->>'subject_template',r.subject_template),
    body_template=coalesce(p_values->>'body_template',r.body_template),
    trigger_config=jsonb_set(r.trigger_config,'{purchaseAnniversaryFallbackEnabled}',coalesce(to_jsonb(p_enabled),r.trigger_config->'purchaseAnniversaryFallbackEnabled','false'::jsonb))
  where r.id=p_id and r.rule_type='purchase_anniversary' returning r.*;
end $$;
revoke execute on function public.update_purchase_anniversary_rule(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.update_purchase_anniversary_rule(uuid,jsonb,boolean) to service_role;


do $$ begin
  if (select contacts from purchase_counts)<>(select count(*) from public.contacts) or (select transactions from purchase_counts)<>(select count(*) from public.transactions) then raise exception 'CRM count changed'; end if;
end $$;
commit;
