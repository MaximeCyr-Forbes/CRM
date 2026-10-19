-- Shared row permissions for verified CRM sessions and delegated OAuth sessions.
-- No change to the service-role scheduler. Unauthenticated and disabled identities get no policy match.
create or replace function crm_auth.member_identity()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('member_id',m.id,'identity_id',a.id,'auth_user_id',i.user_id,
 'broker',m.broker,'role',m.role,'brokers',m.allowed_brokers)
 from crm_auth.verified_google_identity() i
 join public.crm_member_auth_identities a on a.provider=i.provider and a.provider_subject=i.provider_id
   and a.auth_user_id=i.user_id and a.email_normalized=lower(btrim(i.identity_data->>'email'))
 join public.crm_members m on m.id=a.member_id
 join auth.sessions s on s.user_id=i.user_id and s.id::text=auth.jwt()->>'session_id'
 where a.active and m.active and (
  (s.oauth_client_id is null and nullif(auth.jwt()->>'client_id','') is null)
  or exists(select 1 from auth.oauth_consents c join auth.oauth_clients oc on oc.id=c.client_id
    where c.user_id=i.user_id and c.client_id=s.oauth_client_id and c.revoked_at is null
    and oc.deleted_at is null and oc.id::text=auth.jwt()->>'client_id')
 );
$$;
create function crm_auth.is_admin() returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(crm_auth.member_identity()->>'role'='admin',false);
$$;
revoke all on function crm_auth.is_admin() from public,anon;
grant execute on function crm_auth.is_admin() to authenticated;

-- Team/unassigned records are managed by the administrator; broker-owned data remains scoped.
create or replace function crm_auth.can_access(target text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((crm_auth.member_identity()->'brokers') ? target,false)
 or (coalesce(target,'unassigned')='unassigned' and crm_auth.is_admin());
$$;

create table crm_auth.audit_events (
 id uuid primary key default gen_random_uuid(), occurred_at timestamptz not null default now(),
 member_id uuid not null references public.crm_members(id),
 identity_id uuid not null references public.crm_member_auth_identities(id),
 auth_user_id uuid not null references auth.users(id),
 entity text not null, entity_id text, operation text not null,
 source text not null check(source in ('crm','mcp'))
);
alter table crm_auth.audit_events enable row level security;
revoke all on crm_auth.audit_events from public,anon,authenticated;
grant select on crm_auth.audit_events to service_role;

create function crm_auth.stamp_actor() returns trigger language plpgsql security definer set search_path='' as $$
declare m jsonb; doc jsonb; olddoc jsonb; changes jsonb:='{}'; k text; begin
 if auth.uid() is null then return new; end if;
 m:=crm_auth.member_identity();
 if m is null then raise exception 'CRM_MEMBER_REQUIRED' using errcode='42501'; end if;
 doc:=to_jsonb(new); olddoc:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 foreach k in array array['created_by','submitted_by','actor_broker','actor','changed_by','changed_by_broker'] loop
  if doc ? k then
   changes:=changes||jsonb_build_object(k,case when TG_OP='UPDATE' then olddoc->k else m->'broker' end);
  end if;
 end loop;
 foreach k in array array['updated_by','payment_updated_by','acted_by','returned_by','completed_by','opened_by'] loop
  if doc ? k and doc->k <> 'null'::jsonb and (TG_OP='INSERT' or doc->k is distinct from olddoc->k or k='updated_by') then
   changes:=changes||jsonb_build_object(k,m->'broker');
  end if;
 end loop;
 foreach k in array array['created_by_user_id','changed_by_user_id','merged_by_user_id'] loop
  if doc ? k then changes:=changes||jsonb_build_object(k,case when TG_OP='UPDATE' then olddoc->k else m->'auth_user_id' end); end if;
 end loop;
 new:=jsonb_populate_record(new,changes);
 return new;
end; $$;
revoke all on function crm_auth.stamp_actor() from public,anon,authenticated;
create function crm_auth.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare m jsonb; doc jsonb; begin
 if auth.uid() is null then return null; end if;
 m:=crm_auth.member_identity();
 if m is null then raise exception 'CRM_MEMBER_REQUIRED' using errcode='42501'; end if;
 doc:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 insert into crm_auth.audit_events(member_id,identity_id,auth_user_id,entity,entity_id,operation,source)
 values((m->>'member_id')::uuid,(m->>'identity_id')::uuid,auth.uid(),TG_TABLE_NAME,
 coalesce(doc->>'id',doc->>'broker',doc->>'contact_id',doc->>'transaction_id'),TG_OP,
 case when nullif(auth.jwt()->>'client_id','') is null then 'crm' else 'mcp' end);
 return null;
end; $$;
revoke all on function crm_auth.audit_change() from public,anon,authenticated;

-- Explicit table coverage; no broad public-schema grant.
do $$ declare r record; predicate text; begin
 for r in select * from (values
 ('contacts','broker'),('transactions','broker'),('listings','broker'),
 ('mortgage_referrals','broker'),('accounting_expenses','assigned_broker'),
 ('accounting_recurring_expenses','assigned_broker'),('accounting_broker_balances','broker'),
 ('accounting_broker_balance_history','broker'),('automatic_email_deliveries','broker'),
 ('custom_email_manual_deliveries','broker'),('google_drive_roots','broker'),
 ('google_drive_entity_links','broker'),('sign_assignments','broker'),('google_calendar_watch_channels','broker'),
 ('contact_birthday_calendar_events','broker'),('contact_mortgage_renewal_calendar_events','broker')
 ) v(tbl,col) loop
  predicate:=format('crm_auth.can_access(%I::text)',r.col);
  execute format('grant select,insert,update,delete on public.%I to authenticated',r.tbl);
  execute format('create policy crm_member_access on public.%I to authenticated using (%s) with check (%s)',r.tbl,predicate,predicate);
 end loop;
 for r in select * from (values
 ('client_notes','contact_id','contacts'),('contact_addresses','contact_id','contacts'),
 ('pipeline_history','contact_id','contacts'),('contact_birthday_greetings','contact_id','contacts'),
 ('contact_merges','merged_into_contact_id','contacts'),
 ('transaction_notes','transaction_id','transactions'),('transaction_deadlines','transaction_id','transactions'),
 ('transaction_direct_clients','transaction_id','transactions'),
 ('transaction_direct_client_email_deliveries','transaction_id','transactions'),
 ('purchase_anniversary_greetings','transaction_id','transactions'),
 ('listing_activity','listing_id','listings'),('listing_offers','listing_id','listings'),
 ('listing_visits','listing_id','listings'),('listing_marketing_tasks','listing_id','listings'),
 ('listing_price_history','listing_id','listings'),('listing_transaction_links','listing_id','listings'),
 ('accounting_expense_documents','expense_id','accounting_expenses'),
 ('sign_assignment_addons','assignment_id','sign_assignments')
 ) v(tbl,col,parent) loop
  predicate:=format('exists(select 1 from public.%I p where p.id=%I.%I)',r.parent,r.tbl,r.col);
  execute format('grant select,insert,update,delete on public.%I to authenticated',r.tbl);
  execute format('create policy crm_member_access on public.%I to authenticated using (%s) with check (%s)',r.tbl,predicate,predicate);
 end loop;
 for r in select * from (values ('transaction_contacts','transaction_id','transactions'),('listing_contacts','listing_id','listings')) v(tbl,col,parent) loop
  predicate:=format('exists(select 1 from public.%I p where p.id=%I.%I) and exists(select 1 from public.contacts c where c.id=%I.contact_id)',r.parent,r.tbl,r.col,r.tbl);
  execute format('grant select,insert,update,delete on public.%I to authenticated',r.tbl);
  execute format('create policy crm_member_access on public.%I to authenticated using (%s) with check (%s)',r.tbl,predicate,predicate);
 end loop;
 -- Campaign setup affects team-wide sends: administrator only. Broker email delivery rows stay scoped above.
 for r in select unnest(array['automatic_email_rules','custom_email_campaigns','custom_email_campaign_steps',
 'custom_email_campaign_contacts','custom_email_manual_batches','sign_inventory_events']) tbl loop
  execute format('grant select,insert,update,delete on public.%I to authenticated',r.tbl);
  execute format('create policy crm_member_access on public.%I to authenticated using (crm_auth.is_admin()) with check (crm_auth.is_admin())',r.tbl);
 end loop;
 for r in select tablename tbl from pg_policies where schemaname='public' and policyname='crm_member_access' loop
  execute format('create trigger crm_actor before insert or update on public.%I for each row execute function crm_auth.stamp_actor()',r.tbl);
  execute format('create trigger crm_audit after insert or update or delete on public.%I for each row execute function crm_auth.audit_change()',r.tbl);
 end loop;
end; $$;

-- Recommendations: every broker may submit, only an administrator reads/moderates.
grant select,insert,update,delete on public.crm_recommendations to authenticated;
create policy crm_recommendation_admin on public.crm_recommendations to authenticated using(crm_auth.is_admin()) with check(crm_auth.is_admin());
create policy crm_recommendation_submit on public.crm_recommendations for insert to authenticated with check(submitted_by::text=crm_auth.member_identity()->>'broker');
create trigger crm_actor before insert or update on public.crm_recommendations for each row execute function crm_auth.stamp_actor();
create trigger crm_audit after insert or update or delete on public.crm_recommendations for each row execute function crm_auth.audit_change();
alter table public.transaction_notes add column if not exists created_by_user_id uuid references auth.users(id);

-- Keep encrypted Google credentials entirely outside authenticated Data API grants.
revoke all on public.google_calendar_connections from anon,authenticated;
-- Inventory shared totals are readable; mutations go through an explicitly scoped wrapper.
grant select on public.sign_inventory_stock,public.sign_inventory_types to authenticated;
create policy crm_stock_read on public.sign_inventory_stock for select to authenticated using(crm_auth.member_identity() is not null and (broker is null or crm_auth.can_access(broker::text)));
create policy crm_types_read on public.sign_inventory_types for select to authenticated using(crm_auth.member_identity() is not null);

-- Existing business RPCs run with the caller's RLS permissions. Service-role background behavior is unchanged.
do $$ declare r record; begin
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array[
 'accounting_brokers','accounting_list_broker_balances','accounting_materialize_recurring_expenses',
 'accounting_month_date','accounting_promote_invoice','accounting_save_recurring_expense','accounting_set_broker_balance',
 'add_contact_note','assign_contacts','claim_birthday_greeting','claim_purchase_anniversary_greeting',
 'complete_listing_sale','complete_transaction_purchase','complete_transaction_sale',
 'create_custom_listing_marketing_task','create_listing_offer','create_listing_visit','create_listing_with_owners',
 'create_manual_contact_with_addresses','create_transaction_from_listing_offer','create_transaction_with_agenda',
 'create_transaction_with_contacts','delete_contact_note','delete_custom_listing_marketing_task','delete_listing_offer','delete_listing_visit',
 'enrich_contact_birth_dates','import_contacts_with_addresses','merge_contacts','merge_contacts_with_addresses',
 'merge_contacts_with_birthdays','merge_contacts_with_contact_dates','merge_draft_into_contact_with_addresses',
 'mortgage_referral_payment','normalize_contact_address','normalize_contact_address_part',
 'return_listing_transaction_to_market','save_contact_addresses','set_listing_marketing_task_completion',
 'sign_inventory_assignments','sign_inventory_listings','update_birthday_rule','update_contact_with_addresses',
 'update_custom_listing_marketing_task','update_listing_offer','update_listing_visit','update_listing_with_owners',
 'update_pipeline_stage','update_purchase_anniversary_rule','update_transaction_with_contacts']) loop
  execute format('alter function %s security invoker',r.signature);
  execute format('grant execute on function %s to authenticated',r.signature);
 end loop;
end; $$;

-- Invoice paths must belong to a visible expense, including pending uploads and cleanup.
create policy crm_invoice_storage on storage.objects to authenticated
 using(bucket_id='accounting-invoices' and exists(select 1 from public.accounting_expense_documents d where d.storage_path=name))
 with check(bucket_id='accounting-invoices' and exists(select 1 from public.accounting_expense_documents d where d.storage_path=name and d.state='pending'));

-- Shared stock availability must count all assignments, without revealing other brokers' assignments.
create function public.crm_inventory_availability()
returns table(id text,kind text,broker text,label text,total integer,used bigint,available bigint,version integer)
language sql stable security definer set search_path='' as $$
 select s.* from public.sign_inventory_availability() s
 where crm_auth.member_identity() is not null and (s.broker is null or crm_auth.can_access(s.broker));
$$;
revoke all on function public.crm_inventory_availability() from public,anon;
grant execute on function public.crm_inventory_availability() to authenticated;
create function public.crm_inventory_write(p_action text,p_data jsonb,p_actor text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m jsonb; target text; old_broker text; listing_broker text; begin
 m:=crm_auth.member_identity();
 if m is null or m->>'broker' is distinct from p_actor or p_action not in ('assign','edit','return','stock') then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;
 if p_action='stock' then
  if m->>'role'<>'admin' then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;
 else
  select broker::text into old_broker from public.sign_assignments where id=(p_data->>'id')::uuid;
  if old_broker is not null and not crm_auth.can_access(old_broker) then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;
  if p_action in ('assign','edit') then
   target:=p_data->>'broker';
   select broker::text into listing_broker from public.listings where id=(p_data->>'listing_id')::uuid;
   if target is null or listing_broker is distinct from target or not crm_auth.can_access(target) then raise exception 'CRM_FORBIDDEN' using errcode='42501'; end if;
  elsif old_broker is null then raise exception 'CRM_NOT_FOUND' using errcode='42501'; end if;
 end if;
 return public.sign_inventory_write(p_action,p_data,m->>'broker');
end; $$;
revoke all on function public.crm_inventory_write(text,jsonb,text) from public,anon;
grant execute on function public.crm_inventory_write(text,jsonb,text) to authenticated;
-- History is append-only for authenticated users. Cascading parent cleanup remains PostgreSQL-managed.
revoke update,delete on public.accounting_broker_balance_history,public.contact_merges,
 public.pipeline_history,public.listing_activity,public.listing_price_history,public.sign_inventory_events from authenticated;
