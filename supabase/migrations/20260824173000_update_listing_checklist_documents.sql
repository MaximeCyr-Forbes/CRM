begin;

update public.listing_marketing_tasks
set title = 'DRONE'
where task_key = 'video_drone'
  and title is distinct from 'DRONE';

update public.listing_marketing_tasks
set title = 'DOCUMENTS DU PROPRIÉTAIRE'
where task_key = 'documents'
  and title is distinct from 'DOCUMENTS DU PROPRIÉTAIRE';

insert into public.listing_marketing_tasks (listing_id, title, task_key, sort_order)
select listing.id, task.title, task.task_key, task.sort_order
from public.listings as listing
cross join (values
  ('ACTE DE VENTE', 'owner_deed', 31),
  ('CERTIFICAT DE LOCALISATION', 'owner_location_certificate', 32),
  ('REGISTRE FONCIER', 'owner_land_registry', 33),
  ('RELEVÉ HYPOTHÉCAIRE', 'owner_mortgage_statement', 34)
) as task(title, task_key, sort_order)
on conflict (listing_id, task_key) where task_key is not null do nothing;

insert into public.listing_marketing_tasks (listing_id, title, task_key, sort_order)
select listing.id, task.title, task.task_key, task.sort_order
from public.listings as listing
cross join (values
  ('CONVENTION D’INDIVISION', 'condo_indivision_agreement', 35),
  ('ASSURANCES', 'condo_insurance', 36),
  ('RENONCIATION DROIT DE PRÉEMPTION', 'condo_preemption_waiver', 37),
  ('DÉCLARATION DE COPROPRIÉTÉ', 'condo_declaration', 38),
  ('POLICE D’ASSURANCE DE LA COPROPRIÉTÉ (DOIT DÉMONTRER LE MONTANT DE TOUTES LES PRIMES)', 'condo_insurance_policy', 39),
  ('ASSEMBLÉE GÉNÉRALE ANNUELLE', 'condo_annual_general_meeting', 40),
  ('PROCÈS-VERBAUX', 'condo_minutes', 41),
  ('ÉTATS FINANCIERS', 'condo_financial_statements', 42),
  ('BUDGETS', 'condo_budgets', 43),
  ('DESCRIPTION DE L’UNITÉ DE RÉFÉRENCE (FINITIONS D’ORIGINES)', 'condo_reference_unit_description', 44)
) as task(title, task_key, sort_order)
where listing.property_type = 'condo'
on conflict (listing_id, task_key) where task_key is not null do nothing;

insert into public.listing_marketing_tasks (listing_id, title, task_key, sort_order)
select listing.id, task.title, task.task_key, task.sort_order
from public.listings as listing
cross join (values
  ('CERTIFICAT DE PIQUETAGE (S’IL Y A LIEU)', 'land_survey_certificate', 45),
  ('UTILISATION DU CCG RECOMMANDÉE', 'land_ccg_recommended', 46),
  ('GRILLE DE ZONAGE', 'land_zoning_grid', 47)
) as task(title, task_key, sort_order)
where listing.property_type = 'land'
on conflict (listing_id, task_key) where task_key is not null do nothing;

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
    ('PHOTOS', 'photos', 10, null::text),
    ('PANCARTE INSTALLÉE', 'sign', 20, null::text),
    ('DOCUMENTS DU PROPRIÉTAIRE', 'documents', 30, null::text),
    ('ACTE DE VENTE', 'owner_deed', 31, null::text),
    ('CERTIFICAT DE LOCALISATION', 'owner_location_certificate', 32, null::text),
    ('REGISTRE FONCIER', 'owner_land_registry', 33, null::text),
    ('RELEVÉ HYPOTHÉCAIRE', 'owner_mortgage_statement', 34, null::text),
    ('CONVENTION D’INDIVISION', 'condo_indivision_agreement', 35, 'condo'),
    ('ASSURANCES', 'condo_insurance', 36, 'condo'),
    ('RENONCIATION DROIT DE PRÉEMPTION', 'condo_preemption_waiver', 37, 'condo'),
    ('DÉCLARATION DE COPROPRIÉTÉ', 'condo_declaration', 38, 'condo'),
    ('POLICE D’ASSURANCE DE LA COPROPRIÉTÉ (DOIT DÉMONTRER LE MONTANT DE TOUTES LES PRIMES)', 'condo_insurance_policy', 39, 'condo'),
    ('ASSEMBLÉE GÉNÉRALE ANNUELLE', 'condo_annual_general_meeting', 40, 'condo'),
    ('PROCÈS-VERBAUX', 'condo_minutes', 41, 'condo'),
    ('ÉTATS FINANCIERS', 'condo_financial_statements', 42, 'condo'),
    ('BUDGETS', 'condo_budgets', 43, 'condo'),
    ('DESCRIPTION DE L’UNITÉ DE RÉFÉRENCE (FINITIONS D’ORIGINES)', 'condo_reference_unit_description', 44, 'condo'),
    ('CERTIFICAT DE PIQUETAGE (S’IL Y A LIEU)', 'land_survey_certificate', 45, 'land'),
    ('UTILISATION DU CCG RECOMMANDÉE', 'land_ccg_recommended', 46, 'land'),
    ('GRILLE DE ZONAGE', 'land_zoning_grid', 47, 'land'),
    ('PUBLICATION CENTRIS', 'centris', 60, null::text),
    ('RÉSEAUX SOCIAUX', 'social_media', 70, null::text),
    ('VISITE LIBRE', 'open_house', 80, null::text),
    ('DRONE', 'video_drone', 90, null::text)
  ) as task(title, task_key, sort_order, property_requirement)
  where task.property_requirement is null or task.property_requirement = v_listing.property_type;

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

  insert into public.listing_marketing_tasks (listing_id, title, task_key, sort_order)
  select p_listing_id, task.title, task.task_key, task.sort_order
  from (values
    ('PHOTOS', 'photos', 10, null::text),
    ('PANCARTE INSTALLÉE', 'sign', 20, null::text),
    ('DOCUMENTS DU PROPRIÉTAIRE', 'documents', 30, null::text),
    ('ACTE DE VENTE', 'owner_deed', 31, null::text),
    ('CERTIFICAT DE LOCALISATION', 'owner_location_certificate', 32, null::text),
    ('REGISTRE FONCIER', 'owner_land_registry', 33, null::text),
    ('RELEVÉ HYPOTHÉCAIRE', 'owner_mortgage_statement', 34, null::text),
    ('CONVENTION D’INDIVISION', 'condo_indivision_agreement', 35, 'condo'),
    ('ASSURANCES', 'condo_insurance', 36, 'condo'),
    ('RENONCIATION DROIT DE PRÉEMPTION', 'condo_preemption_waiver', 37, 'condo'),
    ('DÉCLARATION DE COPROPRIÉTÉ', 'condo_declaration', 38, 'condo'),
    ('POLICE D’ASSURANCE DE LA COPROPRIÉTÉ (DOIT DÉMONTRER LE MONTANT DE TOUTES LES PRIMES)', 'condo_insurance_policy', 39, 'condo'),
    ('ASSEMBLÉE GÉNÉRALE ANNUELLE', 'condo_annual_general_meeting', 40, 'condo'),
    ('PROCÈS-VERBAUX', 'condo_minutes', 41, 'condo'),
    ('ÉTATS FINANCIERS', 'condo_financial_statements', 42, 'condo'),
    ('BUDGETS', 'condo_budgets', 43, 'condo'),
    ('DESCRIPTION DE L’UNITÉ DE RÉFÉRENCE (FINITIONS D’ORIGINES)', 'condo_reference_unit_description', 44, 'condo'),
    ('CERTIFICAT DE PIQUETAGE (S’IL Y A LIEU)', 'land_survey_certificate', 45, 'land'),
    ('UTILISATION DU CCG RECOMMANDÉE', 'land_ccg_recommended', 46, 'land'),
    ('GRILLE DE ZONAGE', 'land_zoning_grid', 47, 'land'),
    ('PUBLICATION CENTRIS', 'centris', 60, null::text),
    ('RÉSEAUX SOCIAUX', 'social_media', 70, null::text),
    ('VISITE LIBRE', 'open_house', 80, null::text),
    ('DRONE', 'video_drone', 90, null::text)
  ) as task(title, task_key, sort_order, property_requirement)
  where task.property_requirement is null or task.property_requirement = v_listing.property_type
  on conflict (listing_id, task_key) where task_key is not null do nothing;

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

revoke execute on function public.create_listing_with_owners(jsonb, uuid[]) from public, anon, authenticated;
revoke execute on function public.update_listing_with_owners(uuid, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.create_listing_with_owners(jsonb, uuid[]) to service_role;
grant execute on function public.update_listing_with_owners(uuid, jsonb, uuid[]) to service_role;

commit;
