begin;
alter table public.contact_birthday_greetings drop constraint contact_birthday_greetings_contact_id_fkey;
alter table public.contact_birthday_greetings add constraint contact_birthday_greetings_contact_id_fkey foreign key (contact_id) references public.contacts(id) on delete cascade;
alter table public.purchase_anniversary_greetings drop constraint purchase_anniversary_greetings_contact_id_fkey;
alter table public.purchase_anniversary_greetings add constraint purchase_anniversary_greetings_contact_id_fkey foreign key (contact_id) references public.contacts(id) on delete cascade;
create or replace function public.protect_finalized_transaction_contacts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_transaction public.transactions;
begin
  -- FK cascade runs after the parent contact is gone; direct edits stay locked.
  if tg_op = 'DELETE' and not exists (select 1 from public.contacts where id = old.contact_id) then
    return old;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select * into v_transaction from public.transactions where id = old.transaction_id;
    if found and (
      (v_transaction.type = 'sale' and v_transaction.sale_finalized_at is not null)
      or (v_transaction.type = 'purchase' and v_transaction.purchase_finalized_at is not null)
    ) then
      raise exception 'Une transaction finalisée ne peut plus être modifiée.' using errcode = 'P0001';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select * into v_transaction from public.transactions where id = new.transaction_id;
    if found and (
      (v_transaction.type = 'sale' and v_transaction.sale_finalized_at is not null)
      or (v_transaction.type = 'purchase' and v_transaction.purchase_finalized_at is not null)
    ) then
      raise exception 'Une transaction finalisée ne peut plus être modifiée.' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
commit;
