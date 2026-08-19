begin;

create temporary table crm_birthdays_contact_count on commit drop
as select count(*)::bigint as contact_count from public.contacts;

alter table public.contacts
  add column if not exists birth_date date;

create table if not exists public.contact_birthday_calendar_events (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  broker public.broker_assignment not null,
  google_calendar_event_id text,
  synced_birth_date date,
  sync_status public.calendar_sync_status not null default 'pending',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (contact_id, broker),
  constraint contact_birthday_events_assigned_broker_check check (broker <> 'unassigned')
);

create index if not exists contact_birthday_events_broker_idx
  on public.contact_birthday_calendar_events(broker);
create index if not exists contact_birthday_events_status_idx
  on public.contact_birthday_calendar_events(sync_status);
create index if not exists contact_birthday_events_broker_status_idx
  on public.contact_birthday_calendar_events(broker, sync_status);

drop trigger if exists set_contact_birthday_calendar_events_updated_at on public.contact_birthday_calendar_events;
create trigger set_contact_birthday_calendar_events_updated_at
before update on public.contact_birthday_calendar_events
for each row execute function public.set_updated_at();

create or replace function public.queue_contact_birthday_calendar_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.birth_date is not null)
     or (tg_op = 'UPDATE' and new.birth_date is distinct from old.birth_date) then
    insert into public.contact_birthday_calendar_events(contact_id, broker, sync_status, last_error)
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

drop trigger if exists queue_contact_birthdays on public.contacts;
create trigger queue_contact_birthdays
after insert or update of birth_date on public.contacts
for each row execute function public.queue_contact_birthday_calendar_events();

insert into public.contact_birthday_calendar_events(contact_id, broker, sync_status)
select contacts.id, brokers.broker, 'pending'::public.calendar_sync_status
from public.contacts
cross join unnest(array['france','maxime','sandrine']::public.broker_assignment[]) as brokers(broker)
where contacts.birth_date is not null
on conflict (contact_id, broker) do nothing;

create or replace function public.import_contacts_with_addresses(p_entries jsonb, p_source public.contact_source)
returns setof public.contacts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_entry jsonb; v_contact public.contacts;
begin
  for v_entry in select value from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    insert into public.contacts (first_name,last_name,phone,email,birth_date,civic_number,address,apartment,city,province,postal_code,country,broker,source)
    values (
      trim(coalesce(v_entry#>>'{contact,firstName}','')), trim(coalesce(v_entry#>>'{contact,lastName}','')),
      trim(coalesce(v_entry#>>'{contact,phone}','')), trim(coalesce(v_entry#>>'{contact,email}','')),
      nullif(v_entry#>>'{contact,birthDate}','')::date,
      trim(coalesce(v_entry#>>'{contact,civicNumber}','')), trim(coalesce(v_entry#>>'{contact,address}','')),
      trim(coalesce(v_entry#>>'{contact,apartment}','')), trim(coalesce(v_entry#>>'{contact,city}','')),
      trim(coalesce(v_entry#>>'{contact,province}','')), trim(coalesce(v_entry#>>'{contact,postalCode}','')),
      trim(coalesce(v_entry#>>'{contact,country}','')), 'unassigned', p_source
    ) returning * into v_contact;
    if jsonb_array_length(coalesce(v_entry->'addresses','[]'::jsonb)) > 0 then
      select * into v_contact from public.save_contact_addresses(v_contact.id, v_entry->'addresses');
    end if;
    return next v_contact;
  end loop;
end;
$$;

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
    broker=(p_values->>'broker')::public.broker_assignment,
    next_follow_up_date=nullif(p_values->>'nextFollowUpDate','')::date,
    google_calendar_sync_status=case when nullif(p_values->>'nextFollowUpDate','') is null then google_calendar_sync_status else 'pending' end,
    google_calendar_last_error=null
  where id=p_target_id;
  select * into v_result from public.save_contact_addresses(p_target_id, p_addresses);
  insert into public.contact_merges(merged_into_contact_id,merged_from,merged_by_user_id) values(p_target_id,p_incoming_draft,p_merged_by_user_id);
  return v_result;
end;
$$;

create or replace function public.merge_contacts_with_birthdays(
  p_target_id uuid, p_source_id uuid, p_addresses jsonb,
  p_first_name text, p_last_name text, p_phone text, p_email text, p_birth_date date,
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
  select * into v_result from public.merge_contacts_with_addresses(
    p_target_id,p_source_id,p_addresses,p_first_name,p_last_name,p_phone,p_email,
    p_civic_number,p_address,p_apartment,p_city,p_province,p_postal_code,p_country,
    p_broker,p_client_type,p_priority,p_status,p_next_follow_up_date,p_google_event_id,p_google_event_broker,p_merged_by_user_id
  );
  update public.contacts set birth_date=p_birth_date where id=p_target_id returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.enrich_contact_birth_dates(p_updates jsonb)
returns setof public.contacts
language sql
security definer
set search_path = public
as $$
  update public.contacts as contacts
  set birth_date = updates.birth_date
  from (
    select (item->>'contactId')::uuid as contact_id, nullif(item->>'birthDate','')::date as birth_date
    from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) as items(item)
  ) as updates
  where contacts.id = updates.contact_id
    and contacts.birth_date is null
    and updates.birth_date is not null
  returning contacts.*;
$$;

alter table public.contact_birthday_calendar_events enable row level security;
revoke all on public.contact_birthday_calendar_events from public, anon, authenticated;
grant select, insert, update, delete on public.contact_birthday_calendar_events to service_role;
revoke execute on function public.queue_contact_birthday_calendar_events() from public, anon, authenticated;
revoke execute on function public.enrich_contact_birth_dates(jsonb) from public, anon, authenticated;
grant execute on function public.enrich_contact_birth_dates(jsonb) to service_role;
revoke execute on function public.merge_contacts_with_birthdays(
  uuid,uuid,jsonb,text,text,text,text,date,text,text,text,text,text,text,text,
  public.broker_assignment,public.client_type,public.contact_priority,public.contact_status,date,text,public.broker_assignment,uuid
) from public,anon,authenticated;
grant execute on function public.merge_contacts_with_birthdays(
  uuid,uuid,jsonb,text,text,text,text,date,text,text,text,text,text,text,text,
  public.broker_assignment,public.client_type,public.contact_priority,public.contact_status,date,text,public.broker_assignment,uuid
) to service_role;

do $$
declare v_before bigint; v_after bigint;
begin
  select contact_count into v_before from crm_birthdays_contact_count;
  select count(*)::bigint into v_after from public.contacts;
  if v_before <> v_after then
    raise exception 'La migration Anniversaires a modifié le nombre de contacts (% -> %)', v_before, v_after;
  end if;
end;
$$;

commit;
