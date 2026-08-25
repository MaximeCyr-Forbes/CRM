begin;

drop function if exists public.merge_contacts_with_contact_dates(
  uuid, uuid, jsonb, text, text, text, text, date, date,
  text, text, text, text, text, text, text,
  public.broker_assignment, public.client_type, public.contact_priority,
  public.contact_status, date, text, public.broker_assignment, uuid
);

create or replace function public.merge_contacts_with_contact_dates(
  p_target_id uuid,
  p_source_id uuid,
  p_addresses jsonb,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_birth_date date,
  p_mortgage_renewal_date date,
  p_civic_number text,
  p_address text,
  p_apartment text,
  p_city text,
  p_province text,
  p_postal_code text,
  p_country text,
  p_broker public.broker_assignment,
  p_client_type public.client_type,
  p_client_provenance text,
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
set search_path = public, extensions
as $$
declare
  v_source public.contacts;
  v_target public.contacts;
  v_result public.contacts;
  v_last_contact timestamptz;
  v_addresses jsonb;
begin
  if p_target_id is null or p_source_id is null or p_target_id = p_source_id then
    raise exception 'Les contacts à fusionner doivent être différents.' using errcode = '22023';
  end if;

  perform contact.id
  from public.contacts as contact
  where contact.id in (p_target_id, p_source_id)
  order by contact.id
  for update;

  select * into v_target from public.contacts where id = p_target_id;
  select * into v_source from public.contacts where id = p_source_id;
  if v_target.id is null or v_source.id is null then
    raise exception 'Contact de fusion introuvable.' using errcode = 'P0002';
  end if;

  if p_addresses is null or jsonb_typeof(p_addresses) <> 'array' then
    raise exception 'Adresses de fusion invalides.' using errcode = '22023';
  end if;
  if p_client_provenance is not null
     and p_client_provenance not in ('friend_family', 'referral', 'prospecting', 'confia') then
    raise exception 'Provenance du client invalide.' using errcode = '22023';
  end if;

  update public.client_notes
  set contact_id = p_target_id
  where contact_id = p_source_id;

  insert into public.transaction_contacts (transaction_id, contact_id)
  select transaction_id, p_target_id
  from public.transaction_contacts
  where contact_id = p_source_id
  on conflict do nothing;

  delete from public.transaction_contacts
  where contact_id = p_source_id;

  insert into public.listing_contacts (listing_id, contact_id, role, created_at)
  select listing_id, p_target_id, role, created_at
  from public.listing_contacts
  where contact_id = p_source_id
  on conflict do nothing;

  delete from public.listing_contacts
  where contact_id = p_source_id;

  insert into public.custom_email_campaign_contacts (campaign_id, contact_id, created_at)
  select campaign_id, p_target_id, created_at
  from public.custom_email_campaign_contacts
  where contact_id = p_source_id
  on conflict do nothing;

  delete from public.custom_email_campaign_contacts
  where contact_id = p_source_id;

  update public.automatic_email_deliveries
  set contact_id = p_target_id
  where contact_id = p_source_id;

  select max(created_at) into v_last_contact
  from public.client_notes
  where contact_id = p_target_id;

  update public.contacts
  set
    first_name = trim(coalesce(p_first_name, '')),
    last_name = trim(coalesce(p_last_name, '')),
    phone = trim(coalesce(p_phone, '')),
    email = trim(coalesce(p_email, '')),
    birth_date = p_birth_date,
    mortgage_renewal_date = p_mortgage_renewal_date,
    civic_number = trim(coalesce(p_civic_number, '')),
    address = trim(coalesce(p_address, '')),
    apartment = trim(coalesce(p_apartment, '')),
    city = trim(coalesce(p_city, '')),
    province = trim(coalesce(p_province, '')),
    postal_code = trim(coalesce(p_postal_code, '')),
    country = trim(coalesce(p_country, '')),
    broker = p_broker,
    client_type = p_client_type,
    client_provenance = p_client_provenance,
    priority = p_priority,
    status = p_status,
    last_contact_date = greatest(v_target.last_contact_date, v_source.last_contact_date, v_last_contact),
    next_follow_up_date = p_next_follow_up_date,
    google_calendar_event_id = p_google_event_id,
    google_calendar_event_broker = p_google_event_broker,
    google_calendar_sync_status = case
      when p_next_follow_up_date is null then 'synced'::public.calendar_sync_status
      else 'pending'::public.calendar_sync_status
    end,
    google_calendar_last_error = null
  where id = p_target_id
  returning * into v_result;

  v_addresses := p_addresses;
  if jsonb_array_length(v_addresses) = 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'civic_number', contact_address.civic_number,
          'address', contact_address.address,
          'apartment', contact_address.apartment,
          'city', contact_address.city,
          'province', contact_address.province,
          'postal_code', contact_address.postal_code,
          'country', contact_address.country,
          'is_primary', contact_address.contact_id = p_target_id and contact_address.is_primary,
          'label', case
            when contact_address.contact_id = p_target_id and contact_address.is_primary then 'Principale'
            else 'Ancienne adresse'
          end
        )
        order by (contact_address.contact_id = p_target_id and contact_address.is_primary) desc,
          contact_address.created_at desc,
          contact_address.id
      ),
      '[]'::jsonb
    ) into v_addresses
    from public.contact_addresses as contact_address
    where contact_address.contact_id in (p_target_id, p_source_id);
  end if;

  if jsonb_array_length(v_addresses) > 0 then
    select * into v_result
    from public.save_contact_addresses(p_target_id, v_addresses);
  end if;

  insert into public.contact_merges (
    merged_into_contact_id,
    merged_from,
    merged_by_user_id
  ) values (
    p_target_id,
    to_jsonb(v_source),
    p_merged_by_user_id
  );

  delete from public.contacts
  where id = p_source_id;

  return v_result;
end;
$$;

create or replace function public.merge_draft_into_contact_with_addresses(
  p_target_id uuid,
  p_values jsonb,
  p_addresses jsonb,
  p_incoming_draft jsonb,
  p_merged_by_user_id uuid
)
returns public.contacts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_target public.contacts;
  v_result public.contacts;
  v_client_provenance text;
  v_broker public.broker_assignment;
  v_next_follow_up_date date;
begin
  select * into v_target
  from public.contacts
  where id = p_target_id
  for update;

  if not found then
    raise exception 'Contact introuvable.' using errcode = 'P0002';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Valeurs de fusion invalides.' using errcode = '22023';
  end if;
  if p_addresses is null or jsonb_typeof(p_addresses) <> 'array' then
    raise exception 'Adresses de fusion invalides.' using errcode = '22023';
  end if;
  if p_incoming_draft is null or jsonb_typeof(p_incoming_draft) <> 'object' then
    raise exception 'Contact importé invalide.' using errcode = '22023';
  end if;

  v_client_provenance := nullif(trim(p_values->>'clientProvenance'), '');
  if v_client_provenance is not null
     and v_client_provenance not in ('friend_family', 'referral', 'prospecting', 'confia') then
    raise exception 'Provenance du client invalide.' using errcode = '22023';
  end if;
  if coalesce(p_values->>'broker', '') not in ('france', 'maxime', 'sandrine', 'unassigned') then
    raise exception 'Courtier invalide.' using errcode = '22023';
  end if;
  if nullif(trim(p_values->>'clientType'), '') is not null
     and p_values->>'clientType' not in ('buyer', 'seller', 'buyer_seller') then
    raise exception 'Type de client invalide.' using errcode = '22023';
  end if;
  if nullif(trim(p_values->>'priority'), '') is not null
     and p_values->>'priority' not in ('hot', 'warm', 'cold') then
    raise exception 'Priorité invalide.' using errcode = '22023';
  end if;
  if coalesce(p_values->>'status', '') not in ('active', 'inactive') then
    raise exception 'Statut invalide.' using errcode = '22023';
  end if;

  v_broker := (p_values->>'broker')::public.broker_assignment;
  v_next_follow_up_date := nullif(trim(p_values->>'nextFollowUpDate'), '')::date;

  update public.contacts
  set
    first_name = trim(coalesce(p_values->>'firstName', '')),
    last_name = trim(coalesce(p_values->>'lastName', '')),
    phone = trim(coalesce(p_values->>'phone', '')),
    email = trim(coalesce(p_values->>'email', '')),
    birth_date = nullif(trim(p_values->>'birthDate'), '')::date,
    mortgage_renewal_date = nullif(trim(p_values->>'mortgageRenewalDate'), '')::date,
    broker = v_broker,
    client_type = nullif(trim(p_values->>'clientType'), '')::public.client_type,
    client_provenance = v_client_provenance,
    priority = nullif(trim(p_values->>'priority'), '')::public.contact_priority,
    status = (p_values->>'status')::public.contact_status,
    next_follow_up_date = v_next_follow_up_date,
    google_calendar_sync_status = case
      when v_target.broker is distinct from v_broker
        or v_target.next_follow_up_date is distinct from v_next_follow_up_date
        or v_target.google_calendar_event_id is not null
      then 'pending'::public.calendar_sync_status
      else v_target.google_calendar_sync_status
    end,
    google_calendar_last_error = null
  where id = p_target_id
  returning * into v_result;

  select * into v_result
  from public.save_contact_addresses(p_target_id, p_addresses);

  insert into public.contact_merges (
    merged_into_contact_id,
    merged_from,
    merged_by_user_id
  ) values (
    p_target_id,
    p_incoming_draft,
    p_merged_by_user_id
  );

  return v_result;
end;
$$;

revoke execute on function public.merge_contacts_with_contact_dates(
  uuid, uuid, jsonb, text, text, text, text, date, date,
  text, text, text, text, text, text, text,
  public.broker_assignment, public.client_type, text, public.contact_priority,
  public.contact_status, date, text, public.broker_assignment, uuid
) from public, anon, authenticated;
revoke execute on function public.merge_draft_into_contact_with_addresses(uuid, jsonb, jsonb, jsonb, uuid)
  from public, anon, authenticated;

grant execute on function public.merge_contacts_with_contact_dates(
  uuid, uuid, jsonb, text, text, text, text, date, date,
  text, text, text, text, text, text, text,
  public.broker_assignment, public.client_type, text, public.contact_priority,
  public.contact_status, date, text, public.broker_assignment, uuid
) to service_role;
grant execute on function public.merge_draft_into_contact_with_addresses(uuid, jsonb, jsonb, jsonb, uuid)
  to service_role;

commit;
