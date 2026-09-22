-- Run against a migrated database. All fixtures and changes are rolled back.
begin;
do $$
declare c uuid; other_c uuid := gen_random_uuid(); t uuid := gen_random_uuid(); l uuid := gen_random_uuid(); s text; before_t jsonb; before_l jsonb; blocked boolean;
begin
  insert into public.contacts(id,first_name) values(other_c,'TEST synthetic survivor');
  insert into public.transactions(id,address,type,broker) values(t,'TEST synthetic property','purchase','maxime');
  insert into public.listings(id,address,broker) values(l,'TEST synthetic listing','maxime');
  insert into public.transaction_contacts(transaction_id,contact_id) values(t,other_c);
  foreach s in array array['manual_done','manual_email_sent','auto_email_sent','failed','uncertain'] loop
    c := gen_random_uuid();
    insert into public.contacts(id,first_name,broker) values(c,'TEST synthetic delete','unassigned');
    insert into public.client_notes(contact_id,content,created_by) values(c,'Synthetic note','maxime');
    insert into public.contact_addresses(contact_id,address,normalized_key) values(c,'Synthetic address',c::text);
    insert into public.contact_birthday_greetings(contact_id,occurrence_date,status) values(c,current_date,s);
    insert into public.purchase_anniversary_greetings(transaction_id,contact_id,occurrence_date,status) values(t,c,current_date,s);
    insert into public.transaction_contacts(transaction_id,contact_id) values(t,c);
    insert into public.listing_contacts(listing_id,contact_id) values(l,c);
    -- Finalize only the last case, so direct link editing must still be rejected.
    if s='uncertain' then
      update public.transactions set purchase_finalized_at=now(),notary_date=current_date where id=t;
      blocked := false;
      begin delete from public.transaction_contacts where transaction_id=t and contact_id=c;
      exception when sqlstate 'P0001' then blocked := true; end;
      if not blocked then raise exception 'Finalized direct link deletion allowed'; end if;
    end if;
    select to_jsonb(x) into before_t from public.transactions x where id=t;
    select to_jsonb(x) into before_l from public.listings x where id=l;
    delete from public.contacts where id=c;
    if exists(select 1 from public.contacts where id=c)
      or exists(select 1 from public.client_notes where contact_id=c)
      or exists(select 1 from public.contact_addresses where contact_id=c)
      or exists(select 1 from public.contact_birthday_greetings where contact_id=c)
      or exists(select 1 from public.purchase_anniversary_greetings where contact_id=c)
      or exists(select 1 from public.transaction_contacts where contact_id=c)
      or exists(select 1 from public.listing_contacts where contact_id=c)
    then raise exception 'Dependent row survived for %',s; end if;
    if before_t is distinct from (select to_jsonb(x) from public.transactions x where id=t)
      or before_l is distinct from (select to_jsonb(x) from public.listings x where id=l)
      or not exists(select 1 from public.contacts where id=other_c)
      or not exists(select 1 from public.transaction_contacts where transaction_id=t and contact_id=other_c)
    then raise exception 'Other data changed for %',s; end if;
  end loop;
end $$;
select '5 greeting states, dependencies, finalized link protection and parent preservation passed' as result;
rollback;
