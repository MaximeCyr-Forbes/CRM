begin;

create table public.listing_transaction_associations (
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references public.listings(id) on delete restrict,
 transaction_id uuid not null references public.transactions(id) on delete restrict,
 relation_kind text not null check (relation_kind in ('primary','historical')),
 created_at timestamptz not null default now(),
 created_by uuid not null references public.crm_members(id) on delete restrict,
 created_by_broker text not null,
 detached_at timestamptz,
 detached_by uuid references public.crm_members(id) on delete restrict,
 detached_by_broker text,
 version integer not null default 1 check(version>0),
 check ((detached_at is null) = (detached_by is null))
);
create unique index listing_association_transaction_current on public.listing_transaction_associations(transaction_id) where detached_at is null;
create unique index listing_association_primary_current on public.listing_transaction_associations(listing_id) where detached_at is null and relation_kind='primary';
create index listing_association_history on public.listing_transaction_associations(listing_id,created_at desc);
create index listing_association_creator on public.listing_transaction_associations(created_by);
create index listing_association_detacher on public.listing_transaction_associations(detached_by);
create table public.listing_transaction_association_events (
 id uuid primary key default gen_random_uuid(),
 association_id uuid not null references public.listing_transaction_associations(id) on delete restrict,
 operation text not null check(operation in ('attached','detached','historical')),
 actor_id uuid not null references public.crm_members(id) on delete restrict,
 actor_broker text not null,
 created_at timestamptz not null default now()
);
create index listing_association_events_parent on public.listing_transaction_association_events(association_id,created_at);
create index listing_association_events_actor on public.listing_transaction_association_events(actor_id);
alter table public.listing_transaction_associations enable row level security;
alter table public.listing_transaction_association_events enable row level security;
revoke all on public.listing_transaction_associations,public.listing_transaction_association_events from public,anon,authenticated;
grant select on public.listing_transaction_associations,public.listing_transaction_association_events to authenticated;
grant select on public.listing_transaction_associations,public.listing_transaction_association_events to service_role;
create policy association_read on public.listing_transaction_associations for select to authenticated using (
 exists(select 1 from public.listings l where l.id=listing_id)
 and exists(select 1 from public.transactions t where t.id=transaction_id)
);
create policy association_event_read on public.listing_transaction_association_events for select to authenticated using (
 exists(select 1 from public.listing_transaction_associations a where a.id=association_id)
);

-- Private privileged implementation: only association tables may be written here.
-- Parent access is checked with the same live CRM identity as the existing RLS.
create function crm_auth.change_listing_association(p_listing_id uuid,p_transaction_id uuid,p_kind text,p_listing_version timestamptz,p_transaction_version timestamptz,p_detach_id uuid,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m jsonb; l public.listings; t public.transactions; a public.listing_transaction_associations; olda public.listing_transaction_associations; legacy uuid;
begin
 m:=crm_auth.member_identity();
 if m is null then raise exception 'ASSOCIATION_FORBIDDEN' using errcode='42501'; end if;
 select * into l from public.listings where id=p_listing_id for update;
 if not found or not crm_auth.can_access(l.broker::text) then raise exception 'ASSOCIATION_FORBIDDEN' using errcode='42501'; end if;
 select * into t from public.transactions where id=p_transaction_id for update;
 if not found or not crm_auth.can_access(t.broker::text) then raise exception 'ASSOCIATION_FORBIDDEN' using errcode='42501'; end if;
 if p_detach_id is not null then
  select * into a from public.listing_transaction_associations where id=p_detach_id and listing_id=l.id and transaction_id=t.id for update;
  if not found then raise exception 'ASSOCIATION_NOT_FOUND'; end if;
  if a.detached_at is not null then return to_jsonb(a); end if;
  if p_version is distinct from a.version then raise exception 'ASSOCIATION_STALE'; end if;
  update public.listing_transaction_associations set detached_at=now(),detached_by=(m->>'member_id')::uuid,detached_by_broker=m->>'broker',version=version+1 where id=a.id returning * into a;
  insert into public.listing_transaction_association_events(association_id,operation,actor_id,actor_broker) values(a.id,'detached',(m->>'member_id')::uuid,m->>'broker');
  return to_jsonb(a);
 end if;
 if p_kind is null or p_kind not in ('primary','historical') then raise exception 'ASSOCIATION_INVALID_KIND'; end if;
 select * into a from public.listing_transaction_associations where transaction_id=t.id and detached_at is null;
 if found then
  if a.listing_id=l.id then return to_jsonb(a); end if;
  raise exception 'ASSOCIATION_TRANSACTION_LINKED';
 end if;
 select listing_id into legacy from public.listing_transaction_links where transaction_id=t.id;
 if found then
  if legacy=l.id then return jsonb_build_object('source','accepted_offer','listing_id',l.id,'transaction_id',t.id); end if;
  raise exception 'ASSOCIATION_TRANSACTION_LINKED';
 end if;
 if l.updated_at is distinct from p_listing_version or t.updated_at is distinct from p_transaction_version then raise exception 'ASSOCIATION_STALE'; end if;
 if t.status='cancelled' then p_kind:='historical'; end if;
 if p_kind='primary' then
  if exists(select 1 from public.listing_transaction_links k join public.transactions x on x.id=k.transaction_id where k.listing_id=l.id and x.status<>'cancelled') then raise exception 'ASSOCIATION_LISTING_LINKED'; end if;
  for olda in select a1.* from public.listing_transaction_associations a1 join public.transactions x on x.id=a1.transaction_id where a1.listing_id=l.id and a1.detached_at is null and a1.relation_kind='primary' and x.status='cancelled' loop
   update public.listing_transaction_associations set relation_kind='historical',version=version+1 where id=olda.id;
   insert into public.listing_transaction_association_events(association_id,operation,actor_id,actor_broker) values(olda.id,'historical',(m->>'member_id')::uuid,m->>'broker');
  end loop;
  if exists(select 1 from public.listing_transaction_associations where listing_id=l.id and detached_at is null and relation_kind='primary') then raise exception 'ASSOCIATION_LISTING_LINKED'; end if;
 end if;
 insert into public.listing_transaction_associations(listing_id,transaction_id,relation_kind,created_by,created_by_broker)
 values(l.id,t.id,p_kind,(m->>'member_id')::uuid,m->>'broker') returning * into a;
 insert into public.listing_transaction_association_events(association_id,operation,actor_id,actor_broker) values(a.id,'attached',(m->>'member_id')::uuid,m->>'broker');
 return to_jsonb(a);
end; $$;
revoke all on function crm_auth.change_listing_association(uuid,uuid,text,timestamptz,timestamptz,uuid,integer) from public,anon;
grant execute on function crm_auth.change_listing_association(uuid,uuid,text,timestamptz,timestamptz,uuid,integer) to authenticated;
create function public.change_listing_association(p_listing_id uuid,p_transaction_id uuid,p_kind text,p_listing_version timestamptz,p_transaction_version timestamptz,p_detach_id uuid default null,p_version integer default null)
returns jsonb language sql security invoker set search_path='' as $$
 select crm_auth.change_listing_association(p_listing_id,p_transaction_id,p_kind,p_listing_version,p_transaction_version,p_detach_id,p_version);
$$;
revoke all on function public.change_listing_association(uuid,uuid,text,timestamptz,timestamptz,uuid,integer) from public,anon;
grant execute on function public.change_listing_association(uuid,uuid,text,timestamptz,timestamptz,uuid,integer) to authenticated;

-- The old PA RPC locks the same Listing before inserting its link. A rejected
-- insert rolls its entire transaction back (including any new Transaction).
create function crm_auth.guard_offer_documentary_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.listings where id=new.listing_id for update;
 perform 1 from public.transactions where id=new.transaction_id for update;
 if exists(select 1 from public.listing_transaction_associations a join public.transactions t on t.id=a.transaction_id
  where a.detached_at is null and (a.transaction_id=new.transaction_id or (a.listing_id=new.listing_id and a.relation_kind='primary' and t.status<>'cancelled')))
 then raise exception 'ASSOCIATION_LISTING_LINKED'; end if;
 return new;
end; $$;
revoke all on function crm_auth.guard_offer_documentary_link() from public,anon,authenticated;
create trigger guard_offer_documentary_link before insert or update on public.listing_transaction_links for each row execute function crm_auth.guard_offer_documentary_link();
commit;
