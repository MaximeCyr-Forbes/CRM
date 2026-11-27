begin;

alter table public.automatic_email_rules
  add column archived_at timestamptz,
  add column version integer not null default 1 check (version > 0);

-- Covers every writer, including the existing fallback-switch RPCs.
create function public.guard_recurring_email_rule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Check all brokers' claims even when the member's greeting RLS is scoped.
  if old.archived_at is null and new.archived_at is not null and (
    (old.rule_type='birthday' and exists(select 1 from public.contact_birthday_greetings where status in ('auto_sending','manual_sending')))
    or (old.rule_type='purchase_anniversary' and exists(select 1 from public.purchase_anniversary_greetings where status in ('auto_sending','manual_sending')))
  ) then raise exception 'RULE_SEND_IN_PROGRESS'; end if;
  if new.rule_type is distinct from old.rule_type then
    raise exception 'RULE_TYPE_IMMUTABLE' using errcode='22023';
  end if;
  if old.archived_at is not null and new.archived_at is not null and
    (new.trigger_config @> '{"birthdayFallbackEnabled":true}' or new.trigger_config @> '{"purchaseAnniversaryFallbackEnabled":true}') then
    raise exception 'RULE_ARCHIVED' using errcode='P0001';
  end if;
  if new.archived_at is not null or old.archived_at is distinct from new.archived_at or new.status='paused' then
    new.status := 'paused';
    if new.rule_type='birthday' then
      new.trigger_config := jsonb_set(new.trigger_config,'{birthdayFallbackEnabled}','false');
    elsif new.rule_type='purchase_anniversary' then
      new.trigger_config := jsonb_set(new.trigger_config,'{purchaseAnniversaryFallbackEnabled}','false');
    end if;
  end if;
  new.version := old.version + 1;
  return new;
end $$;
revoke all on function public.guard_recurring_email_rule() from public,anon,authenticated;
create trigger recurring_email_rule_guard before update on public.automatic_email_rules
for each row execute function public.guard_recurring_email_rule();

-- Serialize sending claims with archive. A sending claim must finish first;
-- archiving never edits any greeting or delivery history.
create function public.guard_recurring_email_claim() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare r public.automatic_email_rules;
begin
  if new.status not in ('auto_sending','manual_sending') then return new; end if;
  select * into r from public.automatic_email_rules
    where rule_type=case when tg_table_name='contact_birthday_greetings' then 'birthday' else 'purchase_anniversary' end
    for update;
  if not found or r.archived_at is not null then raise exception 'RULE_ARCHIVED'; end if;
  if new.status='auto_sending' and (r.status='paused' or not coalesce(
    (r.trigger_config->>case when r.rule_type='birthday' then 'birthdayFallbackEnabled' else 'purchaseAnniversaryFallbackEnabled' end)::boolean,false)) then
    raise exception 'RULE_FALLBACK_DISABLED';
  end if;
  return new;
end $$;
revoke all on function public.guard_recurring_email_claim() from public,anon,authenticated;
create trigger recurring_email_claim_guard before insert or update on public.contact_birthday_greetings
for each row execute function public.guard_recurring_email_claim();
create trigger recurring_email_claim_guard before insert or update on public.purchase_anniversary_greetings
for each row execute function public.guard_recurring_email_claim();

create function public.mutate_recurring_email_rule(p_id uuid,p_version integer,p_action text,p_values jsonb default '{}')
returns setof public.automatic_email_rules
language plpgsql security invoker set search_path = '' as $$
declare r public.automatic_email_rules;
begin
  if p_version is null or p_version < 1 or p_action is null or p_action not in ('update','archive','restore') then
    raise exception 'RULE_INVALID_INPUT' using errcode='22023';
  end if;
  select * into r from public.automatic_email_rules where id=p_id for update;
  if not found then return; end if;
  if p_action='archive' and r.archived_at is not null then return next r; return; end if;
  if r.version<>p_version then raise exception 'RULE_VERSION_CONFLICT'; end if;
  if p_action='archive' then
    if (r.rule_type='birthday' and exists(select 1 from public.contact_birthday_greetings where status in ('auto_sending','manual_sending')))
      or (r.rule_type='purchase_anniversary' and exists(select 1 from public.purchase_anniversary_greetings where status in ('auto_sending','manual_sending'))) then
      raise exception 'RULE_SEND_IN_PROGRESS';
    end if;
    return query update public.automatic_email_rules set archived_at=now() where id=p_id returning *;
  elsif p_action='restore' then
    if r.archived_at is null then return next r; return; end if;
    return query update public.automatic_email_rules set archived_at=null,status='paused' where id=p_id returning *;
  else
    if r.archived_at is not null then raise exception 'RULE_ARCHIVED'; end if;
    if p_values->>'rule_type' is distinct from r.rule_type then raise exception 'RULE_TYPE_IMMUTABLE' using errcode='22023'; end if;
    if r.rule_type='birthday' then
      return query select * from public.update_birthday_rule(p_id,p_values);
    elsif r.rule_type='purchase_anniversary' then
      return query select * from public.update_purchase_anniversary_rule(p_id,p_values);
    else
      return query update public.automatic_email_rules set
        name=p_values->>'name',status=p_values->>'status',execution_mode=p_values->>'execution_mode',
        default_broker=(p_values->>'default_broker')::public.broker_assignment,
        subject_template=p_values->>'subject_template',body_template=p_values->>'body_template',
        send_hour=(p_values->>'send_hour')::integer,send_minute=(p_values->>'send_minute')::integer,
        timezone=p_values->>'timezone',trigger_config=p_values->'trigger_config'
        where id=p_id returning *;
    end if;
  end if;
end $$;
revoke all on function public.mutate_recurring_email_rule(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.mutate_recurring_email_rule(uuid,integer,text,jsonb) to authenticated,service_role;
-- Existing member RLS and actor/audit triggers remain authoritative.
revoke delete on public.automatic_email_rules from authenticated,service_role;
commit;
