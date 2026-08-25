begin;

alter table public.transactions
  add column if not exists creation_key uuid;

create unique index if not exists transactions_creation_key_unique_idx
  on public.transactions (creation_key)
  where creation_key is not null;

create or replace function public.create_transaction_with_contacts(
  p_values jsonb,
  p_contact_ids uuid[],
  p_creation_key uuid
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions;
begin
  if p_creation_key is null then
    raise exception 'Clé de création requise.' using errcode = 'P0001';
  end if;

  select * into v_transaction
  from public.transactions
  where creation_key = p_creation_key;
  if found then
    return v_transaction;
  end if;

  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Valeurs de Transaction invalides.' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_values) as supplied(field_name)
    where supplied.field_name not in (
      'address', 'centris_number', 'type', 'broker', 'price',
      'promise_date', 'status', 'general_notes'
    )
  ) then
    raise exception 'Champ de Transaction non autorisé.' using errcode = 'P0001';
  end if;
  if not (p_values ? 'address')
    or jsonb_typeof(p_values->'address') <> 'string'
    or length(trim(p_values->>'address')) = 0 then
    raise exception 'Adresse de Transaction invalide.' using errcode = 'P0001';
  end if;
  if not (p_values ? 'type') or p_values->>'type' not in ('purchase', 'sale') then
    raise exception 'Type de Transaction invalide.' using errcode = 'P0001';
  end if;
  if not (p_values ? 'broker')
    or p_values->>'broker' not in ('france', 'maxime', 'sandrine') then
    raise exception 'Courtier de Transaction invalide.' using errcode = 'P0001';
  end if;
  if not (p_values ? 'status') or p_values->>'status' not in (
    'new', 'pa_preparation', 'pa_sent', 'pa_accepted', 'inspection',
    'financing', 'other_conditions', 'conditions_met', 'notary',
    'completed', 'cancelled', 'on_market', 'offer_received', 'negotiation'
  ) then
    raise exception 'Statut de Transaction invalide.' using errcode = 'P0001';
  end if;
  if p_values ? 'price' and jsonb_typeof(p_values->'price') not in ('number', 'null') then
    raise exception 'Prix de Transaction invalide.' using errcode = 'P0001';
  end if;
  if p_values ? 'promise_date'
    and jsonb_typeof(p_values->'promise_date') not in ('string', 'null') then
    raise exception 'Date de promesse invalide.' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from (
      select distinct requested.contact_id
      from unnest(coalesce(p_contact_ids, array[]::uuid[])) as requested(contact_id)
    ) as requested
    left join public.contacts as contact on contact.id = requested.contact_id
    where requested.contact_id is null or contact.id is null
  ) then
    raise exception 'Contact lié invalide.' using errcode = 'P0001';
  end if;

  insert into public.transactions (
    address,
    centris_number,
    type,
    broker,
    price,
    promise_date,
    status,
    general_notes,
    creation_key
  ) values (
    trim(p_values->>'address'),
    trim(coalesce(p_values->>'centris_number', '')),
    p_values->>'type',
    (p_values->>'broker')::public.broker_assignment,
    nullif(p_values->>'price', '')::numeric,
    nullif(p_values->>'promise_date', '')::date,
    p_values->>'status',
    trim(coalesce(p_values->>'general_notes', '')),
    p_creation_key
  )
  on conflict (creation_key) where creation_key is not null do nothing
  returning * into v_transaction;

  if not found then
    select * into v_transaction
    from public.transactions
    where creation_key = p_creation_key;
    if not found then
      raise exception 'Transaction idempotente introuvable.' using errcode = 'P0001';
    end if;
    return v_transaction;
  end if;

  insert into public.transaction_contacts (transaction_id, contact_id)
  select v_transaction.id, requested.contact_id
  from (
    select distinct requested_id as contact_id
    from unnest(coalesce(p_contact_ids, array[]::uuid[])) as requested(requested_id)
  ) as requested;

  return v_transaction;
end;
$$;

create or replace function public.update_transaction_with_contacts(
  p_transaction_id uuid,
  p_values jsonb,
  p_contact_ids uuid[] default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions;
begin
  select * into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction introuvable.' using errcode = 'P0001';
  end if;
  if v_transaction.sale_finalized_at is not null
    or v_transaction.purchase_finalized_at is not null then
    raise exception 'Une transaction finalisée ne peut plus être modifiée.' using errcode = 'P0001';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Valeurs de Transaction invalides.' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_values) as supplied(field_name)
    where supplied.field_name not in (
      'address', 'centris_number', 'type', 'broker', 'price',
      'promise_date', 'status', 'general_notes'
    )
  ) then
    raise exception 'Champ de Transaction non autorisé.' using errcode = 'P0001';
  end if;
  if p_values ? 'address' and (
    jsonb_typeof(p_values->'address') <> 'string'
    or length(trim(p_values->>'address')) = 0
  ) then
    raise exception 'Adresse de Transaction invalide.' using errcode = 'P0001';
  end if;
  if p_values ? 'type' and p_values->>'type' not in ('purchase', 'sale') then
    raise exception 'Type de Transaction invalide.' using errcode = 'P0001';
  end if;
  if p_values ? 'broker' and p_values->>'broker' not in ('france', 'maxime', 'sandrine') then
    raise exception 'Courtier de Transaction invalide.' using errcode = 'P0001';
  end if;
  if p_values ? 'status' and p_values->>'status' not in (
    'new', 'pa_preparation', 'pa_sent', 'pa_accepted', 'inspection',
    'financing', 'other_conditions', 'conditions_met', 'notary',
    'completed', 'cancelled', 'on_market', 'offer_received', 'negotiation'
  ) then
    raise exception 'Statut de Transaction invalide.' using errcode = 'P0001';
  end if;
  if p_values ? 'price' and jsonb_typeof(p_values->'price') not in ('number', 'null') then
    raise exception 'Prix de Transaction invalide.' using errcode = 'P0001';
  end if;
  if p_values ? 'promise_date'
    and jsonb_typeof(p_values->'promise_date') not in ('string', 'null') then
    raise exception 'Date de promesse invalide.' using errcode = 'P0001';
  end if;
  if p_contact_ids is not null and exists (
    select 1
    from (
      select distinct requested.contact_id
      from unnest(p_contact_ids) as requested(contact_id)
    ) as requested
    left join public.contacts as contact on contact.id = requested.contact_id
    where requested.contact_id is null or contact.id is null
  ) then
    raise exception 'Contact lié invalide.' using errcode = 'P0001';
  end if;

  if p_values <> '{}'::jsonb then
    update public.transactions
    set
      address = case when p_values ? 'address' then trim(p_values->>'address') else address end,
      centris_number = case when p_values ? 'centris_number' then trim(coalesce(p_values->>'centris_number', '')) else centris_number end,
      type = case when p_values ? 'type' then p_values->>'type' else type end,
      broker = case when p_values ? 'broker' then (p_values->>'broker')::public.broker_assignment else broker end,
      price = case when p_values ? 'price' then nullif(p_values->>'price', '')::numeric else price end,
      promise_date = case when p_values ? 'promise_date' then nullif(p_values->>'promise_date', '')::date else promise_date end,
      status = case when p_values ? 'status' then p_values->>'status' else status end,
      general_notes = case when p_values ? 'general_notes' then trim(coalesce(p_values->>'general_notes', '')) else general_notes end
    where id = p_transaction_id
    returning * into v_transaction;
  end if;

  if p_contact_ids is not null then
    delete from public.transaction_contacts
    where transaction_id = p_transaction_id;

    insert into public.transaction_contacts (transaction_id, contact_id)
    select p_transaction_id, requested.contact_id
    from (
      select distinct requested_id as contact_id
      from unnest(p_contact_ids) as requested(requested_id)
    ) as requested;
  end if;

  return v_transaction;
end;
$$;

revoke execute on function public.create_transaction_with_contacts(jsonb, uuid[], uuid)
  from public, anon, authenticated;
revoke execute on function public.update_transaction_with_contacts(uuid, jsonb, uuid[])
  from public, anon, authenticated;

grant execute on function public.create_transaction_with_contacts(jsonb, uuid[], uuid)
  to service_role;
grant execute on function public.update_transaction_with_contacts(uuid, jsonb, uuid[])
  to service_role;

commit;
