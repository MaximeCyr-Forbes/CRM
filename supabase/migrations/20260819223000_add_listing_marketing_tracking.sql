begin;

create table public.listing_marketing_tasks (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  title text not null,
  task_key text,
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by public.broker_assignment,
  sort_order integer not null default 0,
  is_custom boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_marketing_tasks_title_check check (length(trim(title)) > 0),
  constraint listing_marketing_tasks_completed_by_check check (completed_by is null or completed_by <> 'unassigned'),
  constraint listing_marketing_tasks_completion_check check (
    (completed and completed_at is not null)
    or (not completed and completed_at is null and completed_by is null)
  ),
  constraint listing_marketing_tasks_custom_key_check check (
    (is_custom and task_key is null) or not is_custom
  )
);

create table public.listing_visits (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  visit_date date not null,
  visit_time time,
  visiting_broker_name text not null default '',
  visiting_broker_agency text not null default '',
  buyer_names text not null default '',
  feedback text not null default '',
  interest_level text,
  created_by public.broker_assignment,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_visits_interest_check check (interest_level is null or interest_level = any (array['low', 'medium', 'high'])),
  constraint listing_visits_created_by_check check (created_by is null or created_by <> 'unassigned')
);

create table public.listing_activity (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  event_type text not null,
  title text not null,
  detail text not null default '',
  actor_broker public.broker_assignment,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint listing_activity_actor_check check (actor_broker is null or actor_broker <> 'unassigned')
);

create table public.listing_price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  purpose text not null,
  amount numeric(14, 2),
  changed_by public.broker_assignment,
  changed_at timestamptz not null default now(),
  constraint listing_price_history_purpose_check check (purpose = any (array['sale', 'rental'])),
  constraint listing_price_history_amount_check check (amount is null or amount >= 0),
  constraint listing_price_history_actor_check check (changed_by is null or changed_by <> 'unassigned')
);

create unique index listing_marketing_tasks_standard_unique_idx
  on public.listing_marketing_tasks (listing_id, task_key)
  where task_key is not null;
create index listing_marketing_tasks_listing_idx
  on public.listing_marketing_tasks (listing_id, sort_order, created_at);
create index listing_visits_listing_date_idx
  on public.listing_visits (listing_id, visit_date desc, visit_time desc);
create index listing_activity_listing_created_idx
  on public.listing_activity (listing_id, created_at desc);
create index listing_price_history_listing_changed_idx
  on public.listing_price_history (listing_id, changed_at desc);

create trigger listing_marketing_tasks_set_updated_at
before update on public.listing_marketing_tasks
for each row execute function public.set_updated_at();

create trigger listing_visits_set_updated_at
before update on public.listing_visits
for each row execute function public.set_updated_at();

create or replace function public.create_listing_with_owners(
  p_values jsonb,
  p_owner_contact_ids uuid[]
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.listings;
  v_actor public.broker_assignment;
begin
  v_actor := nullif(p_values->>'actorBroker', '')::public.broker_assignment;
  if v_actor = 'unassigned' then v_actor := null; end if;

  if exists (
    select 1 from unnest(coalesce(p_owner_contact_ids, array[]::uuid[])) as requested(owner_id)
    left join public.contacts as contacts on contacts.id = requested.owner_id
    where contacts.id is null
  ) then
    raise exception 'Propriétaire invalide' using errcode = 'P0001';
  end if;

  insert into public.listings (
    civic_number, address, apartment, city, province, postal_code, country,
    centris_number, broker, status, purpose, asking_price, monthly_rent,
    property_type, listing_date, expiration_date, centris_url, public_url,
    primary_image_url, general_notes
  ) values (
    trim(coalesce(p_values->>'civicNumber', '')), trim(coalesce(p_values->>'address', '')),
    trim(coalesce(p_values->>'apartment', '')), trim(coalesce(p_values->>'city', '')),
    trim(coalesce(p_values->>'province', '')), trim(coalesce(p_values->>'postalCode', '')),
    trim(coalesce(p_values->>'country', '')), trim(coalesce(p_values->>'centrisNumber', '')),
    (p_values->>'broker')::public.broker_assignment, p_values->>'status', p_values->>'purpose',
    nullif(p_values->>'askingPrice', '')::numeric, nullif(p_values->>'monthlyRent', '')::numeric,
    p_values->>'propertyType', nullif(p_values->>'listingDate', '')::date,
    nullif(p_values->>'expirationDate', '')::date, trim(coalesce(p_values->>'centrisUrl', '')),
    trim(coalesce(p_values->>'publicUrl', '')), trim(coalesce(p_values->>'primaryImageUrl', '')),
    trim(coalesce(p_values->>'generalNotes', ''))
  ) returning * into v_listing;

  insert into public.listing_contacts (listing_id, contact_id, role)
  select v_listing.id, owners.owner_id, 'owner'
  from (select distinct owner_id from unnest(coalesce(p_owner_contact_ids, array[]::uuid[])) as requested(owner_id)) as owners;

  insert into public.listing_marketing_tasks (listing_id, title, task_key, sort_order)
  select v_listing.id, task.title, task.task_key, task.sort_order
  from (values
    ('PHOTOS', 'photos', 10), ('PANCARTE INSTALLÉE', 'sign', 20),
    ('DOCUMENTS DU PROPRIÉTAIRE REÇUS', 'documents', 30),
    ('DESCRIPTION FRANÇAISE', 'description_fr', 40), ('DESCRIPTION ANGLAISE', 'description_en', 50),
    ('PUBLICATION CENTRIS', 'centris', 60), ('RÉSEAUX SOCIAUX', 'social_media', 70),
    ('VISITE LIBRE', 'open_house', 80), ('VIDÉO / DRONE', 'video_drone', 90)
  ) as task(title, task_key, sort_order);

  if v_listing.purpose = 'sale' and v_listing.asking_price is not null then
    insert into public.listing_price_history (listing_id, purpose, amount, changed_by)
    values (v_listing.id, 'sale', v_listing.asking_price, v_actor);
  elsif v_listing.purpose = 'rental' and v_listing.monthly_rent is not null then
    insert into public.listing_price_history (listing_id, purpose, amount, changed_by)
    values (v_listing.id, 'rental', v_listing.monthly_rent, v_actor);
  end if;

  insert into public.listing_activity (listing_id, event_type, title, actor_broker)
  values (v_listing.id, 'listing_created', 'Listing créé', v_actor);
  return v_listing;
end;
$$;

create or replace function public.update_listing_with_owners(
  p_listing_id uuid,
  p_values jsonb,
  p_owner_contact_ids uuid[] default null
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.listings;
  v_listing public.listings;
  v_actor public.broker_assignment;
begin
  v_actor := nullif(p_values->>'actorBroker', '')::public.broker_assignment;
  if v_actor = 'unassigned' then v_actor := null; end if;
  select * into v_before from public.listings where id = p_listing_id for update;
  if not found then raise exception 'Listing introuvable' using errcode = 'P0001'; end if;

  if p_owner_contact_ids is not null and exists (
    select 1 from unnest(p_owner_contact_ids) as requested(owner_id)
    left join public.contacts as contacts on contacts.id = requested.owner_id
    where contacts.id is null
  ) then raise exception 'Propriétaire invalide' using errcode = 'P0001'; end if;

  update public.listings set
    civic_number = case when p_values ? 'civicNumber' then trim(coalesce(p_values->>'civicNumber', '')) else civic_number end,
    address = case when p_values ? 'address' then trim(coalesce(p_values->>'address', '')) else address end,
    apartment = case when p_values ? 'apartment' then trim(coalesce(p_values->>'apartment', '')) else apartment end,
    city = case when p_values ? 'city' then trim(coalesce(p_values->>'city', '')) else city end,
    province = case when p_values ? 'province' then trim(coalesce(p_values->>'province', '')) else province end,
    postal_code = case when p_values ? 'postalCode' then trim(coalesce(p_values->>'postalCode', '')) else postal_code end,
    country = case when p_values ? 'country' then trim(coalesce(p_values->>'country', '')) else country end,
    centris_number = case when p_values ? 'centrisNumber' then trim(coalesce(p_values->>'centrisNumber', '')) else centris_number end,
    broker = case when p_values ? 'broker' then (p_values->>'broker')::public.broker_assignment else broker end,
    status = case when p_values ? 'status' then p_values->>'status' else status end,
    purpose = case when p_values ? 'purpose' then p_values->>'purpose' else purpose end,
    asking_price = case when p_values ? 'askingPrice' then nullif(p_values->>'askingPrice', '')::numeric else asking_price end,
    monthly_rent = case when p_values ? 'monthlyRent' then nullif(p_values->>'monthlyRent', '')::numeric else monthly_rent end,
    property_type = case when p_values ? 'propertyType' then p_values->>'propertyType' else property_type end,
    listing_date = case when p_values ? 'listingDate' then nullif(p_values->>'listingDate', '')::date else listing_date end,
    expiration_date = case when p_values ? 'expirationDate' then nullif(p_values->>'expirationDate', '')::date else expiration_date end,
    centris_url = case when p_values ? 'centrisUrl' then trim(coalesce(p_values->>'centrisUrl', '')) else centris_url end,
    public_url = case when p_values ? 'publicUrl' then trim(coalesce(p_values->>'publicUrl', '')) else public_url end,
    primary_image_url = case when p_values ? 'primaryImageUrl' then trim(coalesce(p_values->>'primaryImageUrl', '')) else primary_image_url end,
    general_notes = case when p_values ? 'generalNotes' then trim(coalesce(p_values->>'generalNotes', '')) else general_notes end
  where id = p_listing_id returning * into v_listing;

  if p_owner_contact_ids is not null then
    delete from public.listing_contacts where listing_id = p_listing_id;
    insert into public.listing_contacts (listing_id, contact_id, role)
    select p_listing_id, owners.owner_id, 'owner'
    from (select distinct owner_id from unnest(p_owner_contact_ids) as requested(owner_id)) as owners;
  end if;

  if v_before.purpose is distinct from v_listing.purpose then
    insert into public.listing_activity (listing_id, event_type, title, detail, actor_broker)
    values (p_listing_id, 'purpose_changed', 'Type de mandat modifié', v_before.purpose || ' → ' || v_listing.purpose, v_actor);
  end if;
  if v_before.status is distinct from v_listing.status then
    insert into public.listing_activity (listing_id, event_type, title, detail, actor_broker)
    values (p_listing_id, 'status_changed', 'Statut modifié', v_before.status || ' → ' || v_listing.status, v_actor);
  end if;
  if v_before.broker is distinct from v_listing.broker then
    insert into public.listing_activity (listing_id, event_type, title, detail, actor_broker)
    values (p_listing_id, 'broker_changed', 'Courtier responsable modifié', v_before.broker || ' → ' || v_listing.broker, v_actor);
  end if;
  if v_before.general_notes is distinct from v_listing.general_notes then
    insert into public.listing_activity (listing_id, event_type, title, actor_broker)
    values (p_listing_id, 'note_updated', 'Notes internes mises à jour', v_actor);
  end if;

  if v_listing.purpose = 'sale' and v_listing.asking_price is not null
    and (v_before.purpose is distinct from 'sale' or v_before.asking_price is distinct from v_listing.asking_price) then
    insert into public.listing_price_history (listing_id, purpose, amount, changed_by)
    values (p_listing_id, 'sale', v_listing.asking_price, v_actor);
    insert into public.listing_activity (listing_id, event_type, title, detail, actor_broker, metadata)
    values (p_listing_id, 'price_changed', 'Prix demandé modifié',
      coalesce(v_before.asking_price::text, '—') || ' → ' || v_listing.asking_price::text, v_actor,
      jsonb_build_object('before', v_before.asking_price, 'after', v_listing.asking_price));
  elsif v_listing.purpose = 'rental' and v_listing.monthly_rent is not null
    and (v_before.purpose is distinct from 'rental' or v_before.monthly_rent is distinct from v_listing.monthly_rent) then
    insert into public.listing_price_history (listing_id, purpose, amount, changed_by)
    values (p_listing_id, 'rental', v_listing.monthly_rent, v_actor);
    insert into public.listing_activity (listing_id, event_type, title, detail, actor_broker, metadata)
    values (p_listing_id, 'rent_changed', 'Loyer mensuel modifié',
      coalesce(v_before.monthly_rent::text, '—') || ' → ' || v_listing.monthly_rent::text, v_actor,
      jsonb_build_object('before', v_before.monthly_rent, 'after', v_listing.monthly_rent));
  end if;
  return v_listing;
end;
$$;

create or replace function public.set_listing_marketing_task_completion(
  p_listing_id uuid, p_task_id uuid, p_completed boolean, p_actor public.broker_assignment default null
)
returns public.listing_marketing_tasks language plpgsql security definer set search_path = public as $$
declare v_task public.listing_marketing_tasks;
begin
  if p_actor = 'unassigned' then p_actor := null; end if;
  update public.listing_marketing_tasks set completed = p_completed,
    completed_at = case when p_completed then now() else null end,
    completed_by = case when p_completed then p_actor else null end
  where id = p_task_id and listing_id = p_listing_id returning * into v_task;
  if not found then raise exception 'Tâche introuvable' using errcode = 'P0001'; end if;
  insert into public.listing_activity (listing_id, event_type, title, actor_broker)
  values (p_listing_id, case when p_completed then 'marketing_task_completed' else 'marketing_task_reopened' end,
    v_task.title || case when p_completed then ' complétée' else ' rouverte' end, p_actor);
  return v_task;
end; $$;

create or replace function public.create_custom_listing_marketing_task(
  p_listing_id uuid, p_title text, p_actor public.broker_assignment default null
)
returns public.listing_marketing_tasks language plpgsql security definer set search_path = public as $$
declare v_task public.listing_marketing_tasks;
begin
  if p_actor = 'unassigned' then p_actor := null; end if;
  insert into public.listing_marketing_tasks (listing_id, title, sort_order, is_custom)
  select p_listing_id, trim(p_title), coalesce(max(sort_order), 0) + 10, true
  from public.listing_marketing_tasks where listing_id = p_listing_id returning * into v_task;
  insert into public.listing_activity (listing_id, event_type, title, actor_broker)
  values (p_listing_id, 'custom_task_added', 'Tâche ajoutée · ' || v_task.title, p_actor);
  return v_task;
end; $$;

create or replace function public.update_custom_listing_marketing_task(
  p_listing_id uuid, p_task_id uuid, p_title text, p_actor public.broker_assignment default null
)
returns public.listing_marketing_tasks language plpgsql security definer set search_path = public as $$
declare v_task public.listing_marketing_tasks;
begin
  if p_actor = 'unassigned' then p_actor := null; end if;
  update public.listing_marketing_tasks set title = trim(p_title)
  where id = p_task_id and listing_id = p_listing_id and is_custom returning * into v_task;
  if not found then raise exception 'Tâche personnalisée introuvable' using errcode = 'P0001'; end if;
  insert into public.listing_activity (listing_id, event_type, title, actor_broker)
  values (p_listing_id, 'custom_task_updated', 'Tâche modifiée · ' || v_task.title, p_actor);
  return v_task;
end; $$;

create or replace function public.delete_custom_listing_marketing_task(
  p_listing_id uuid, p_task_id uuid, p_actor public.broker_assignment default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if p_actor = 'unassigned' then p_actor := null; end if;
  delete from public.listing_marketing_tasks where id = p_task_id and listing_id = p_listing_id and is_custom
  returning title into v_title;
  if not found then raise exception 'Tâche personnalisée introuvable' using errcode = 'P0001'; end if;
  insert into public.listing_activity (listing_id, event_type, title, actor_broker)
  values (p_listing_id, 'custom_task_deleted', 'Tâche supprimée · ' || v_title, p_actor);
  return p_task_id;
end; $$;

create or replace function public.create_listing_visit(
  p_listing_id uuid, p_values jsonb, p_actor public.broker_assignment default null
)
returns public.listing_visits language plpgsql security definer set search_path = public as $$
declare v_visit public.listing_visits;
begin
  if p_actor = 'unassigned' then p_actor := null; end if;
  insert into public.listing_visits (listing_id, visit_date, visit_time, visiting_broker_name,
    visiting_broker_agency, buyer_names, feedback, interest_level, created_by)
  values (p_listing_id, (p_values->>'visitDate')::date, nullif(p_values->>'visitTime', '')::time,
    trim(coalesce(p_values->>'visitingBrokerName', '')), trim(coalesce(p_values->>'visitingBrokerAgency', '')),
    trim(coalesce(p_values->>'buyerNames', '')), trim(coalesce(p_values->>'feedback', '')),
    nullif(p_values->>'interestLevel', ''), p_actor) returning * into v_visit;
  insert into public.listing_activity (listing_id, event_type, title, detail, actor_broker, metadata)
  values (p_listing_id, 'visit_added', 'Visite ajoutée', v_visit.visit_date::text, p_actor,
    jsonb_build_object('visitId', v_visit.id));
  return v_visit;
end; $$;

create or replace function public.update_listing_visit(
  p_listing_id uuid, p_visit_id uuid, p_values jsonb, p_actor public.broker_assignment default null
)
returns public.listing_visits language plpgsql security definer set search_path = public as $$
declare v_before public.listing_visits; v_visit public.listing_visits;
begin
  if p_actor = 'unassigned' then p_actor := null; end if;
  select * into v_before from public.listing_visits where id = p_visit_id and listing_id = p_listing_id for update;
  if not found then raise exception 'Visite introuvable' using errcode = 'P0001'; end if;
  update public.listing_visits set visit_date = (p_values->>'visitDate')::date,
    visit_time = nullif(p_values->>'visitTime', '')::time,
    visiting_broker_name = trim(coalesce(p_values->>'visitingBrokerName', '')),
    visiting_broker_agency = trim(coalesce(p_values->>'visitingBrokerAgency', '')),
    buyer_names = trim(coalesce(p_values->>'buyerNames', '')),
    feedback = trim(coalesce(p_values->>'feedback', '')),
    interest_level = nullif(p_values->>'interestLevel', '')
  where id = p_visit_id and listing_id = p_listing_id returning * into v_visit;
  insert into public.listing_activity (listing_id, event_type, title, actor_broker, metadata)
  values (p_listing_id, 'visit_updated',
    case when v_before.feedback is distinct from v_visit.feedback then 'Feedback de visite modifié' else 'Visite modifiée' end,
    p_actor, jsonb_build_object('visitId', v_visit.id));
  return v_visit;
end; $$;

create or replace function public.delete_listing_visit(
  p_listing_id uuid, p_visit_id uuid, p_actor public.broker_assignment default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_date date;
begin
  if p_actor = 'unassigned' then p_actor := null; end if;
  delete from public.listing_visits where id = p_visit_id and listing_id = p_listing_id returning visit_date into v_date;
  if not found then raise exception 'Visite introuvable' using errcode = 'P0001'; end if;
  insert into public.listing_activity (listing_id, event_type, title, detail, actor_broker, metadata)
  values (p_listing_id, 'visit_deleted', 'Visite supprimée', v_date::text, p_actor,
    jsonb_build_object('visitId', p_visit_id));
  return p_visit_id;
end; $$;

insert into public.listing_marketing_tasks (listing_id, title, task_key, sort_order)
select listing.id, task.title, task.task_key, task.sort_order
from public.listings as listing
cross join (values
  ('PHOTOS', 'photos', 10), ('PANCARTE INSTALLÉE', 'sign', 20),
  ('DOCUMENTS DU PROPRIÉTAIRE REÇUS', 'documents', 30),
  ('DESCRIPTION FRANÇAISE', 'description_fr', 40), ('DESCRIPTION ANGLAISE', 'description_en', 50),
  ('PUBLICATION CENTRIS', 'centris', 60), ('RÉSEAUX SOCIAUX', 'social_media', 70),
  ('VISITE LIBRE', 'open_house', 80), ('VIDÉO / DRONE', 'video_drone', 90)
) as task(title, task_key, sort_order)
on conflict (listing_id, task_key) where task_key is not null do nothing;

insert into public.listing_price_history (listing_id, purpose, amount)
select listing.id, listing.purpose,
  case when listing.purpose = 'sale' then listing.asking_price else listing.monthly_rent end
from public.listings as listing
where case when listing.purpose = 'sale' then listing.asking_price else listing.monthly_rent end is not null
and not exists (
  select 1 from public.listing_price_history as history
  where history.listing_id = listing.id and history.purpose = listing.purpose
);

insert into public.listing_activity (listing_id, event_type, title, metadata)
select listing.id, 'listing_created', 'Listing existant intégré au suivi',
  jsonb_build_object('migration', '20260819223000_add_listing_marketing_tracking')
from public.listings as listing
where not exists (
  select 1 from public.listing_activity as activity
  where activity.listing_id = listing.id
    and activity.metadata->>'migration' = '20260819223000_add_listing_marketing_tracking'
);

alter table public.listing_marketing_tasks enable row level security;
alter table public.listing_visits enable row level security;
alter table public.listing_activity enable row level security;
alter table public.listing_price_history enable row level security;

revoke all on public.listing_marketing_tasks, public.listing_visits, public.listing_activity, public.listing_price_history from public, anon, authenticated;
grant select, insert, update, delete on public.listing_marketing_tasks, public.listing_visits to service_role;
grant select, insert on public.listing_activity, public.listing_price_history to service_role;

revoke execute on function public.set_listing_marketing_task_completion(uuid, uuid, boolean, public.broker_assignment) from public, anon, authenticated;
revoke execute on function public.create_custom_listing_marketing_task(uuid, text, public.broker_assignment) from public, anon, authenticated;
revoke execute on function public.update_custom_listing_marketing_task(uuid, uuid, text, public.broker_assignment) from public, anon, authenticated;
revoke execute on function public.delete_custom_listing_marketing_task(uuid, uuid, public.broker_assignment) from public, anon, authenticated;
revoke execute on function public.create_listing_visit(uuid, jsonb, public.broker_assignment) from public, anon, authenticated;
revoke execute on function public.update_listing_visit(uuid, uuid, jsonb, public.broker_assignment) from public, anon, authenticated;
revoke execute on function public.delete_listing_visit(uuid, uuid, public.broker_assignment) from public, anon, authenticated;

grant execute on function public.set_listing_marketing_task_completion(uuid, uuid, boolean, public.broker_assignment) to service_role;
grant execute on function public.create_custom_listing_marketing_task(uuid, text, public.broker_assignment) to service_role;
grant execute on function public.update_custom_listing_marketing_task(uuid, uuid, text, public.broker_assignment) to service_role;
grant execute on function public.delete_custom_listing_marketing_task(uuid, uuid, public.broker_assignment) to service_role;
grant execute on function public.create_listing_visit(uuid, jsonb, public.broker_assignment) to service_role;
grant execute on function public.update_listing_visit(uuid, uuid, jsonb, public.broker_assignment) to service_role;
grant execute on function public.delete_listing_visit(uuid, uuid, public.broker_assignment) to service_role;

commit;
