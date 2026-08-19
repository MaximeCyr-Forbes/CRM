begin;

-- Garde-fou : cette migration retire uniquement les métadonnées du Pipeline.
create temporary table crm_pipeline_removal_contact_count
on commit drop
as select count(*)::bigint as contact_count from public.contacts;

-- Les fonctions de fusion sont conservées à l'identique. Seule leur ancienne
-- instruction de rattachement à pipeline_history est retirée avant la
-- suppression de la table. merge_draft_into_contact_with_addresses ne dépend
-- pas de pipeline_history et ne nécessite donc aucune modification.
do $$
declare
  v_function regprocedure;
  v_definition text;
  v_updated_definition text;
begin
  foreach v_function in array array[
    to_regprocedure(
      'public.merge_contacts(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,public.broker_assignment,public.client_type,public.contact_priority,public.contact_status,date,text,public.broker_assignment,uuid)'
    ),
    to_regprocedure(
      'public.merge_contacts_with_addresses(uuid,uuid,jsonb,text,text,text,text,text,text,text,text,text,text,text,public.broker_assignment,public.client_type,public.contact_priority,public.contact_status,date,text,public.broker_assignment,uuid)'
    )
  ]
  loop
    if v_function is null then
      continue;
    end if;

    select pg_get_functiondef(v_function) into v_definition;
    if position('pipeline_history' in lower(v_definition)) = 0 then
      continue;
    end if;

    v_updated_definition := regexp_replace(
      v_definition,
      E'\\s*update\\s+public\\.pipeline_history\\s+set\\s+contact_id\\s*=\\s*p_target_id\\s+where\\s+contact_id\\s*=\\s*p_source_id\\s*;',
      E'\n',
      'gi'
    );

    if v_updated_definition = v_definition then
      raise exception 'Impossible de retirer la dépendance pipeline_history de %', v_function;
    end if;

    execute v_updated_definition;
    select pg_get_functiondef(v_function) into v_definition;
    if position('pipeline_history' in lower(v_definition)) > 0 then
      raise exception 'La fonction % dépend encore de pipeline_history', v_function;
    end if;
  end loop;
end;
$$;

drop function if exists public.update_pipeline_stage(uuid, text, text, public.broker_assignment);
drop function if exists public.update_pipeline_stage(uuid, text, text);

drop index if exists public.contacts_buyer_pipeline_idx;
drop index if exists public.contacts_seller_pipeline_idx;
drop index if exists public.pipeline_history_contact_idx;

alter table public.contacts
  drop constraint if exists contacts_buyer_pipeline_stage_check,
  drop constraint if exists contacts_seller_pipeline_stage_check;

drop table if exists public.pipeline_history;

alter table public.contacts
  drop column if exists buyer_pipeline_stage,
  drop column if exists seller_pipeline_stage;

do $$
declare
  v_before bigint;
  v_after bigint;
begin
  select contact_count into v_before from crm_pipeline_removal_contact_count;
  select count(*)::bigint into v_after from public.contacts;
  if v_before <> v_after then
    raise exception 'La migration Pipeline a modifié le nombre de contacts (% -> %)', v_before, v_after;
  end if;
end;
$$;

commit;
