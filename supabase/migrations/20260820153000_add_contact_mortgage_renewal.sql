begin;

create temporary table crm_mortgage_renewal_contact_count on commit drop
as select count(*)::bigint as contact_count from public.contacts;

alter table public.contacts
  add column if not exists mortgage_renewal_date date;

create table if not exists public.contact_mortgage_renewal_calendar_events (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  broker public.broker_assignment not null,
  google_calendar_event_id text,
  synced_mortgage_renewal_date date,
  sync_status public.calendar_sync_status not null default 'pending',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (contact_id, broker),
  constraint contact_mortgage_renewal_events_assigned_broker_check check (broker <> 'unassigned')
);

create index if not exists contact_mortgage_renewal_events_broker_idx
  on public.contact_mortgage_renewal_calendar_events(broker);
create index if not exists contact_mortgage_renewal_events_status_idx
  on public.contact_mortgage_renewal_calendar_events(sync_status);
create index if not exists contact_mortgage_renewal_events_broker_status_idx
  on public.contact_mortgage_renewal_calendar_events(broker, sync_status);
create index if not exists contacts_mortgage_renewal_date_idx
  on public.contacts(mortgage_renewal_date)
  where mortgage_renewal_date is not null;

drop trigger if exists set_contact_mortgage_renewal_calendar_events_updated_at
  on public.contact_mortgage_renewal_calendar_events;
create trigger set_contact_mortgage_renewal_calendar_events_updated_at
before update on public.contact_mortgage_renewal_calendar_events
for each row execute function public.set_updated_at();

create or replace function public.queue_contact_mortgage_renewal_calendar_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.mortgage_renewal_date is not null)
     or (tg_op = 'UPDATE' and new.mortgage_renewal_date is distinct from old.mortgage_renewal_date) then
    insert into public.contact_mortgage_renewal_calendar_events(contact_id, broker, sync_status, last_error)
    select new.id, broker, 'pending'::public.calendar_sync_status, null
    from unnest(array['france','maxime','sandrine']::public.broker_assignment[]) as brokers(broker)
    on conflict (contact_id, broker) do update set
      sync_status = 'pending',
      last_error = null,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists queue_contact_mortgage_renewals on public.contacts;
create trigger queue_contact_mortgage_renewals
after insert or update of mortgage_renewal_date on public.contacts
for each row execute function public.queue_contact_mortgage_renewal_calendar_events();

create or replace function public.merge_draft_into_contact_with_addresses(
  p_target_id uuid, p_values jsonb, p_addresses jsonb, p_incoming_draft jsonb, p_merged_by_user_id uuid
)
returns public.contacts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_result public.contacts;
begin
  perform 1 from public.contacts where id=p_target_id for update;
  if not found then raise exception 'Contact introuvable'; end if;
  update public.contacts set
    first_name=trim(coalesce(p_values->>'firstName','')), last_name=trim(coalesce(p_values->>'lastName','')),
    phone=trim(coalesce(p_values->>'phone','')), email=trim(coalesce(p_values->>'email','')),
    birth_date=nullif(p_values->>'birthDate','')::date,
    mortgage_renewal_date=nullif(p_values->>'mortgageRenewalDate','')::date,
    broker=(p_values->>'broker')::public.broker_assignment,
    next_follow_up_date=nullif(p_values->>'nextFollowUpDate','')::date,
    google_calendar_sync_status=case when nullif(p_values->>'nextFollowUpDate','') is null then google_calendar_sync_status else 'pending' end,
    google_calendar_last_error=null
  where id=p_target_id;
  select * into v_result from public.save_contact_addresses(p_target_id, p_addresses);
  insert into public.contact_merges(merged_into_contact_id,merged_from,merged_by_user_id)
  values(p_target_id,p_incoming_draft,p_merged_by_user_id);
  return v_result;
end;
$$;

create or replace function public.merge_contacts_with_contact_dates(
  p_target_id uuid, p_source_id uuid, p_addresses jsonb,
  p_first_name text, p_last_name text, p_phone text, p_email text,
  p_birth_date date, p_mortgage_renewal_date date,
  p_civic_number text, p_address text, p_apartment text, p_city text, p_province text, p_postal_code text, p_country text,
  p_broker public.broker_assignment, p_client_type public.client_type, p_priority public.contact_priority, p_status public.contact_status,
  p_next_follow_up_date date, p_google_event_id text, p_google_event_broker public.broker_assignment, p_merged_by_user_id uuid
)
returns public.contacts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_result public.contacts;
begin
  select * into v_result from public.merge_contacts_with_birthdays(
    p_target_id,p_source_id,p_addresses,p_first_name,p_last_name,p_phone,p_email,p_birth_date,
    p_civic_number,p_address,p_apartment,p_city,p_province,p_postal_code,p_country,
    p_broker,p_client_type,p_priority,p_status,p_next_follow_up_date,p_google_event_id,p_google_event_broker,p_merged_by_user_id
  );
  update public.contacts
  set mortgage_renewal_date=p_mortgage_renewal_date
  where id=p_target_id
  returning * into v_result;
  return v_result;
end;
$$;

alter table public.contact_mortgage_renewal_calendar_events enable row level security;
revoke all on public.contact_mortgage_renewal_calendar_events from public, anon, authenticated;
grant select, insert, update, delete on public.contact_mortgage_renewal_calendar_events to service_role;
revoke execute on function public.queue_contact_mortgage_renewal_calendar_events() from public, anon, authenticated;
revoke execute on function public.merge_contacts_with_contact_dates(
  uuid,uuid,jsonb,text,text,text,text,date,date,text,text,text,text,text,text,text,
  public.broker_assignment,public.client_type,public.contact_priority,public.contact_status,date,text,public.broker_assignment,uuid
) from public,anon,authenticated;
grant execute on function public.merge_contacts_with_contact_dates(
  uuid,uuid,jsonb,text,text,text,text,date,date,text,text,text,text,text,text,text,
  public.broker_assignment,public.client_type,public.contact_priority,public.contact_status,date,text,public.broker_assignment,uuid
) to service_role;

do $$
declare v_before bigint; v_after bigint;
begin
  select contact_count into v_before from crm_mortgage_renewal_contact_count;
  select count(*)::bigint into v_after from public.contacts;
  if v_before <> v_after then
    raise exception 'La migration Renouvellements hypothécaires a modifié le nombre de contacts (% -> %)', v_before, v_after;
  end if;
end;
$$;

commit;
