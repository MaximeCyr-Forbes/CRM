begin;

-- Additive only: existing transaction/deadline values remain untouched.
do $$
declare v_transactions bigint; v_deadlines bigint;
begin
  select count(*) into v_transactions from public.transactions;
  select count(*) into v_deadlines from public.transaction_deadlines;
  alter table public.transaction_deadlines
    add column source_type text not null default 'manual',
    add column source_document text,
    add column source_form text,
    add column source_section text,
    add column source_text text,
    add column source_confidence text;
  alter table public.transaction_deadlines
    add constraint transaction_deadlines_source_type_check check (source_type in ('manual', 'oaciq')),
    add constraint transaction_deadlines_source_confidence_check check (source_confidence is null or source_confidence in ('high', 'medium', 'low'));
  if (select count(*) from public.transactions) <> v_transactions
     or (select count(*) from public.transaction_deadlines) <> v_deadlines then
    raise exception 'Le nombre de transactions ou échéances a changé.';
  end if;
end;
$$;

-- Reuse the current transaction/contact RPC; this outer function is ONE SQL transaction.
-- Explicitly no Calendar call, pending flag, external HTTP call, or document storage.
create or replace function public.create_transaction_with_agenda(
  p_values jsonb,
  p_contact_ids uuid[],
  p_creation_key uuid,
  p_deadlines jsonb
)
returns public.transactions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transaction public.transactions;
  v_deadline jsonb;
  v_field text;
  v_date date;
begin
  if p_creation_key is null then
    raise exception 'Clé de création requise.' using errcode = '22023';
  end if;
  -- Serialize retries of a dossier, including its entire agenda.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_creation_key::text, 7219));
  select * into v_transaction from public.transactions where creation_key = p_creation_key;
  if found then return v_transaction; end if;

  if p_deadlines is null or jsonb_typeof(p_deadlines) <> 'array' then
    raise exception 'Échéances invalides.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_deadlines) > 100 then
    raise exception 'Trop d’échéances.' using errcode = '22023';
  end if;

  -- Validate all entries before creating anything. Errors from inserts also roll back everything.
  for v_deadline in select value from jsonb_array_elements(p_deadlines) loop
    if jsonb_typeof(v_deadline) <> 'object' then
      raise exception 'Échéance invalide.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_object_keys(v_deadline) as f(k) where k not in (
      'title', 'due_date', 'due_time', 'source_type', 'source_document',
      'source_form', 'source_section', 'source_text', 'source_confidence'
    )) then
      raise exception 'Champ d’échéance non autorisé.' using errcode = '22023';
    end if;
    if coalesce(jsonb_typeof(v_deadline->'title'), '') <> 'string'
      or length(trim(v_deadline->>'title')) not between 1 and 300
      or coalesce(jsonb_typeof(v_deadline->'due_date'), '') <> 'string'
      or coalesce(v_deadline->>'due_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(v_deadline->>'source_type', '') not in ('manual', 'oaciq') then
      raise exception 'Titre, date ou source invalide.' using errcode = '22023';
    end if;
    v_date := (v_deadline->>'due_date')::date;
    if v_date < date '1900-01-01' or v_date > date '2200-12-31'
      or to_char(v_date, 'YYYY-MM-DD') <> v_deadline->>'due_date' then
      raise exception 'Date d’échéance invalide.' using errcode = '22023';
    end if;
    if v_deadline->>'due_time' is not null and (
      jsonb_typeof(v_deadline->'due_time') <> 'string'
      or v_deadline->>'due_time' !~ '^([01]\d|2[0-3]):[0-5]\d$'
    ) then
      raise exception 'Heure d’échéance invalide.' using errcode = '22023';
    end if;
    foreach v_field in array array['source_document', 'source_form', 'source_section', 'source_text', 'source_confidence'] loop
      if v_deadline ? v_field and jsonb_typeof(v_deadline->v_field) not in ('string', 'null') then
        raise exception 'Provenance d’échéance invalide.' using errcode = '22023';
      end if;
    end loop;
    if length(coalesce(v_deadline->>'source_document', '')) > 255
      or length(coalesce(v_deadline->>'source_form', '')) > 100
      or length(coalesce(v_deadline->>'source_section', '')) > 100
      or length(coalesce(v_deadline->>'source_text', '')) > 20000
      or (v_deadline->>'source_confidence' is not null and v_deadline->>'source_confidence' not in ('high', 'medium', 'low')) then
      raise exception 'Provenance d’échéance invalide.' using errcode = '22023';
    end if;
  end loop;

  select * into v_transaction from public.create_transaction_with_contacts(p_values, p_contact_ids, p_creation_key);
  insert into public.transaction_deadlines (
    transaction_id, title, due_date, due_time, completed,
    source_type, source_document, source_form, source_section, source_text, source_confidence,
    google_calendar_sync_status, google_calendar_event_id, google_calendar_event_broker
  )
  select v_transaction.id, trim(d->>'title'), (d->>'due_date')::date,
    (d->>'due_time')::time, false, d->>'source_type',
    case when d->>'source_type' = 'oaciq' then d->>'source_document' end,
    case when d->>'source_type' = 'oaciq' then d->>'source_form' end,
    case when d->>'source_type' = 'oaciq' then d->>'source_section' end,
    case when d->>'source_type' = 'oaciq' then d->>'source_text' end,
    case when d->>'source_type' = 'oaciq' then d->>'source_confidence' end,
    'synced'::public.calendar_sync_status, null, null
  from jsonb_array_elements(p_deadlines) as deadlines(d);
  return v_transaction;
end;
$$;

revoke execute on function public.create_transaction_with_agenda(jsonb, uuid[], uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_transaction_with_agenda(jsonb, uuid[], uuid, jsonb) to service_role;

commit;
