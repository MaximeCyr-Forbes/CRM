begin;

create temporary table crm_client_provenance_contact_count on commit drop
as select count(*)::bigint as contact_count from public.contacts;

alter table public.contacts
  add column if not exists client_provenance text;

do $$ begin
  alter table public.contacts
    add constraint contacts_client_provenance_check check (
      client_provenance is null
      or client_provenance in ('friend_family', 'referral', 'prospecting', 'confia')
    );
exception when duplicate_object then null;
end $$;

do $$
declare v_before bigint; v_after bigint;
begin
  select contact_count into v_before from crm_client_provenance_contact_count;
  select count(*)::bigint into v_after from public.contacts;
  if v_before <> v_after then
    raise exception 'La migration Provenance du client a modifié le nombre de contacts (% -> %)', v_before, v_after;
  end if;
end;
$$;

commit;
