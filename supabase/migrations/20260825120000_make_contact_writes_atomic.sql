begin;

alter table public.contacts
  add column if not exists creation_key uuid;

create unique index if not exists contacts_creation_key_unique_idx
  on public.contacts (creation_key)
  where creation_key is not null;

create or replace function public.create_manual_contact_with_addresses(
  p_values jsonb,
  p_addresses jsonb,
  p_creation_key uuid
)
returns public.contacts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_contact public.contacts;
  v_broker public.broker_assignment;
  v_client_type public.client_type;
  v_client_provenance text;
  v_priority public.contact_priority;
  v_status public.contact_status;
begin
  if p_creation_key is null then
    raise exception 'Clé de création requise.' using errcode = '22023';
  end if;

  select * into v_contact
  from public.contacts
  where creation_key = p_creation_key;

  if found then
    return v_contact;
  end if;

  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Données du Contact invalides.' using errcode = '22023';
  end if;

  if p_addresses is null or jsonb_typeof(p_addresses) <> 'array' then
    raise exception 'Adresses invalides.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_values) as fields(field)
    where fields.field <> all (array[
      'first_name', 'last_name', 'phone', 'email', 'birth_date',
      'mortgage_renewal_date', 'broker', 'client_type',
      'client_provenance', 'priority', 'status'
    ])
  ) then
    raise exception 'Champ Contact non autorisé.' using errcode = '22023';
  end if;

  if coalesce(trim(p_values->>'first_name'), '') = ''
     and coalesce(trim(p_values->>'last_name'), '') = ''
     and coalesce(trim(p_values->>'phone'), '') = ''
     and coalesce(trim(p_values->>'email'), '') = '' then
    raise exception 'Ajoutez au minimum un nom, un téléphone ou un email.' using errcode = '22023';
  end if;

  if coalesce(p_values->>'broker', '') not in ('france', 'maxime', 'sandrine') then
    raise exception 'Courtier invalide.' using errcode = '22023';
  end if;
  v_broker := (p_values->>'broker')::public.broker_assignment;

  if nullif(trim(p_values->>'client_type'), '') is not null
     and p_values->>'client_type' not in ('buyer', 'seller', 'buyer_seller') then
    raise exception 'Type de client invalide.' using errcode = '22023';
  end if;
  v_client_type := nullif(trim(p_values->>'client_type'), '')::public.client_type;

  v_client_provenance := nullif(trim(p_values->>'client_provenance'), '');
  if v_client_provenance is not null
     and v_client_provenance not in ('friend_family', 'referral', 'prospecting', 'confia') then
    raise exception 'Provenance du client invalide.' using errcode = '22023';
  end if;

  if nullif(trim(p_values->>'priority'), '') is not null
     and p_values->>'priority' not in ('hot', 'warm', 'cold') then
    raise exception 'Priorité invalide.' using errcode = '22023';
  end if;
  v_priority := nullif(trim(p_values->>'priority'), '')::public.contact_priority;

  if coalesce(nullif(trim(p_values->>'status'), ''), 'active') not in ('active', 'inactive') then
    raise exception 'Statut invalide.' using errcode = '22023';
  end if;
  v_status := coalesce(nullif(trim(p_values->>'status'), ''), 'active')::public.contact_status;

  insert into public.contacts (
    first_name,
    last_name,
    phone,
    email,
    birth_date,
    mortgage_renewal_date,
    broker,
    client_type,
    client_provenance,
    priority,
    status,
    source,
    creation_key
  ) values (
    coalesce(trim(p_values->>'first_name'), ''),
    coalesce(trim(p_values->>'last_name'), ''),
    coalesce(trim(p_values->>'phone'), ''),
    coalesce(trim(p_values->>'email'), ''),
    nullif(trim(p_values->>'birth_date'), '')::date,
    nullif(trim(p_values->>'mortgage_renewal_date'), '')::date,
    v_broker,
    v_client_type,
    v_client_provenance,
    v_priority,
    v_status,
    'manual',
    p_creation_key
  )
  on conflict (creation_key) where creation_key is not null do nothing
  returning * into v_contact;

  if v_contact.id is null then
    select * into v_contact
    from public.contacts
    where creation_key = p_creation_key;
    return v_contact;
  end if;

  select * into v_contact
  from public.save_contact_addresses(v_contact.id, p_addresses);

  return v_contact;
end;
$$;

create or replace function public.update_contact_with_addresses(
  p_contact_id uuid,
  p_values jsonb,
  p_addresses jsonb default null
)
returns public.contacts
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_contact public.contacts;
  v_result public.contacts;
  v_next_broker public.broker_assignment;
  v_client_provenance text;
begin
  select * into v_contact
  from public.contacts
  where id = p_contact_id
  for update;

  if not found then
    raise exception 'Contact introuvable.' using errcode = 'P0002';
  end if;

  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Données du Contact invalides.' using errcode = '22023';
  end if;

  if p_addresses is not null and jsonb_typeof(p_addresses) <> 'array' then
    raise exception 'Adresses invalides.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_values) as fields(field)
    where fields.field <> all (array[
      'first_name', 'last_name', 'phone', 'email', 'birth_date',
      'mortgage_renewal_date', 'broker', 'client_type',
      'client_provenance', 'priority', 'status'
    ])
  ) then
    raise exception 'Champ Contact non autorisé.' using errcode = '22023';
  end if;

  if p_values ? 'broker' then
    if coalesce(p_values->>'broker', '') not in ('france', 'maxime', 'sandrine', 'unassigned') then
      raise exception 'Courtier invalide.' using errcode = '22023';
    end if;
    v_next_broker := (p_values->>'broker')::public.broker_assignment;
  else
    v_next_broker := v_contact.broker;
  end if;

  if p_values ? 'client_type'
     and nullif(trim(p_values->>'client_type'), '') is not null
     and p_values->>'client_type' not in ('buyer', 'seller', 'buyer_seller') then
    raise exception 'Type de client invalide.' using errcode = '22023';
  end if;

  if p_values ? 'client_provenance' then
    v_client_provenance := nullif(trim(p_values->>'client_provenance'), '');
    if v_client_provenance is not null
       and v_client_provenance not in ('friend_family', 'referral', 'prospecting', 'confia') then
      raise exception 'Provenance du client invalide.' using errcode = '22023';
    end if;
  else
    v_client_provenance := v_contact.client_provenance;
  end if;

  if p_values ? 'priority'
     and nullif(trim(p_values->>'priority'), '') is not null
     and p_values->>'priority' not in ('hot', 'warm', 'cold') then
    raise exception 'Priorité invalide.' using errcode = '22023';
  end if;

  if p_values ? 'status'
     and coalesce(p_values->>'status', '') not in ('active', 'inactive') then
    raise exception 'Statut invalide.' using errcode = '22023';
  end if;

  if coalesce(case when p_values ? 'first_name' then trim(p_values->>'first_name') else v_contact.first_name end, '') = ''
     and coalesce(case when p_values ? 'last_name' then trim(p_values->>'last_name') else v_contact.last_name end, '') = ''
     and coalesce(case when p_values ? 'phone' then trim(p_values->>'phone') else v_contact.phone end, '') = ''
     and coalesce(case when p_values ? 'email' then trim(p_values->>'email') else v_contact.email end, '') = '' then
    raise exception 'Ajoutez au minimum un nom, un téléphone ou un email.' using errcode = '22023';
  end if;

  update public.contacts
  set
    first_name = case when p_values ? 'first_name' then coalesce(trim(p_values->>'first_name'), '') else first_name end,
    last_name = case when p_values ? 'last_name' then coalesce(trim(p_values->>'last_name'), '') else last_name end,
    phone = case when p_values ? 'phone' then coalesce(trim(p_values->>'phone'), '') else phone end,
    email = case when p_values ? 'email' then coalesce(trim(p_values->>'email'), '') else email end,
    birth_date = case when p_values ? 'birth_date' then nullif(trim(p_values->>'birth_date'), '')::date else birth_date end,
    mortgage_renewal_date = case when p_values ? 'mortgage_renewal_date' then nullif(trim(p_values->>'mortgage_renewal_date'), '')::date else mortgage_renewal_date end,
    broker = v_next_broker,
    client_type = case when p_values ? 'client_type' then nullif(trim(p_values->>'client_type'), '')::public.client_type else client_type end,
    client_provenance = v_client_provenance,
    priority = case when p_values ? 'priority' then nullif(trim(p_values->>'priority'), '')::public.contact_priority else priority end,
    status = case when p_values ? 'status' then (p_values->>'status')::public.contact_status else status end,
    google_calendar_sync_status = case
      when broker is distinct from v_next_broker then 'pending'::public.calendar_sync_status
      else google_calendar_sync_status
    end,
    google_calendar_last_error = case
      when broker is distinct from v_next_broker then null
      else google_calendar_last_error
    end
  where id = p_contact_id
  returning * into v_result;

  if p_addresses is not null then
    select * into v_result
    from public.save_contact_addresses(p_contact_id, p_addresses);
  end if;

  return v_result;
end;
$$;

create or replace function public.add_contact_note(
  p_contact_id uuid,
  p_content text,
  p_created_by public.broker_assignment,
  p_created_at timestamptz default now()
)
returns public.client_notes
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_contact public.contacts;
  v_author public.broker_assignment;
  v_content text;
  v_created_at timestamptz;
  v_note public.client_notes;
begin
  select * into v_contact
  from public.contacts
  where id = p_contact_id
  for update;

  if not found then
    raise exception 'Contact introuvable.' using errcode = 'P0002';
  end if;

  v_content := trim(coalesce(p_content, ''));
  if v_content = '' then
    raise exception 'Le contenu de la note est requis.' using errcode = '22023';
  end if;
  if char_length(v_content) > 10000 then
    raise exception 'La note ne peut pas dépasser 10000 caractères.' using errcode = '22023';
  end if;

  v_author := case
    when p_created_by in ('france', 'maxime', 'sandrine') then p_created_by
    when v_contact.broker in ('france', 'maxime', 'sandrine') then v_contact.broker
    else null
  end;
  if v_author is null then
    raise exception 'Un courtier doit être attribué avant d’ajouter une note.' using errcode = '22023';
  end if;

  v_created_at := coalesce(p_created_at, now());
  insert into public.client_notes (
    contact_id,
    content,
    created_at,
    created_by,
    created_by_user_id
  ) values (
    p_contact_id,
    v_content,
    v_created_at,
    v_author,
    null
  )
  returning * into v_note;

  update public.contacts
  set last_contact_date = v_created_at
  where id = p_contact_id;

  return v_note;
end;
$$;

create or replace function public.delete_contact_note(p_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_note public.client_notes;
  v_contact public.contacts;
  v_last_contact_date timestamptz;
begin
  select * into v_note
  from public.client_notes
  where id = p_note_id
  for update;

  if not found then
    raise exception 'Note introuvable.' using errcode = 'P0002';
  end if;

  select * into v_contact
  from public.contacts
  where id = v_note.contact_id
  for update;

  if not found then
    raise exception 'Contact introuvable.' using errcode = 'P0002';
  end if;

  delete from public.client_notes
  where id = p_note_id;

  select max(created_at) into v_last_contact_date
  from public.client_notes
  where contact_id = v_note.contact_id;

  update public.contacts
  set last_contact_date = v_last_contact_date
  where id = v_note.contact_id;

  return jsonb_build_object(
    'noteId', v_note.id,
    'contactId', v_note.contact_id,
    'lastContactDate', v_last_contact_date
  );
end;
$$;

revoke execute on function public.create_manual_contact_with_addresses(jsonb, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function public.update_contact_with_addresses(uuid, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function public.add_contact_note(uuid, text, public.broker_assignment, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.delete_contact_note(uuid)
  from public, anon, authenticated;

grant execute on function public.create_manual_contact_with_addresses(jsonb, jsonb, uuid)
  to service_role;
grant execute on function public.update_contact_with_addresses(uuid, jsonb, jsonb)
  to service_role;
grant execute on function public.add_contact_note(uuid, text, public.broker_assignment, timestamptz)
  to service_role;
grant execute on function public.delete_contact_note(uuid)
  to service_role;

commit;
