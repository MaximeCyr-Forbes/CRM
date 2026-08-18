begin;

create extension if not exists pg_trgm;

alter table public.contacts
  add column if not exists address text not null default '',
  add column if not exists apartment text not null default '',
  add column if not exists city text not null default '',
  add column if not exists province text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists country text not null default '';

drop function if exists public.merge_contacts(
  uuid, uuid, text, text, text, text,
  public.broker_assignment, public.client_type, public.contact_priority,
  public.contact_status, date, text, public.broker_assignment, uuid
);

create or replace function public.merge_contacts(
  p_target_id uuid,
  p_source_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_address text,
  p_apartment text,
  p_city text,
  p_province text,
  p_postal_code text,
  p_country text,
  p_broker public.broker_assignment,
  p_client_type public.client_type,
  p_priority public.contact_priority,
  p_status public.contact_status,
  p_next_follow_up_date date,
  p_google_event_id text,
  p_google_event_broker public.broker_assignment,
  p_merged_by_user_id uuid
)
returns public.contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.contacts;
  v_target public.contacts;
  v_result public.contacts;
  v_last_contact timestamptz;
begin
  if p_target_id = p_source_id then
    raise exception 'Les contacts à fusionner doivent être différents';
  end if;

  select * into v_target from public.contacts where id = p_target_id for update;
  select * into v_source from public.contacts where id = p_source_id for update;
  if v_target.id is null or v_source.id is null then
    raise exception 'Contact de fusion introuvable';
  end if;

  update public.client_notes set contact_id = p_target_id where contact_id = p_source_id;
  update public.pipeline_history set contact_id = p_target_id where contact_id = p_source_id;

  select max(created_at) into v_last_contact
  from public.client_notes
  where contact_id = p_target_id;

  update public.contacts
  set
    first_name = trim(p_first_name),
    last_name = trim(p_last_name),
    phone = trim(p_phone),
    email = trim(p_email),
    address = trim(p_address),
    apartment = trim(p_apartment),
    city = trim(p_city),
    province = trim(p_province),
    postal_code = trim(p_postal_code),
    country = trim(p_country),
    broker = p_broker,
    client_type = p_client_type,
    priority = p_priority,
    status = p_status,
    last_contact_date = greatest(v_target.last_contact_date, v_source.last_contact_date, v_last_contact),
    next_follow_up_date = p_next_follow_up_date,
    google_calendar_event_id = p_google_event_id,
    google_calendar_event_broker = p_google_event_broker,
    google_calendar_sync_status = case when p_next_follow_up_date is null then 'synced' else 'pending' end,
    google_calendar_last_error = null
  where id = p_target_id
  returning * into v_result;

  insert into public.contact_merges (merged_into_contact_id, merged_from, merged_by_user_id)
  values (p_target_id, to_jsonb(v_source), p_merged_by_user_id);

  delete from public.contacts where id = p_source_id;
  return v_result;
end;
$$;

create index if not exists contacts_address_trgm_idx
  on public.contacts using gin (address gin_trgm_ops);
create index if not exists contacts_city_trgm_idx
  on public.contacts using gin (city gin_trgm_ops);
create index if not exists contacts_postal_code_trgm_idx
  on public.contacts using gin (postal_code gin_trgm_ops);

revoke execute on function public.merge_contacts(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  public.broker_assignment, public.client_type, public.contact_priority,
  public.contact_status, date, text, public.broker_assignment, uuid
) from public, anon, authenticated;

grant execute on function public.merge_contacts(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text,
  public.broker_assignment, public.client_type, public.contact_priority,
  public.contact_status, date, text, public.broker_assignment, uuid
) to service_role;

commit;
