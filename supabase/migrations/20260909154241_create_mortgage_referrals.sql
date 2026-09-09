-- Additive only. No existing transaction or contact data is changed.
create table public.mortgage_referrals (
  id uuid primary key default gen_random_uuid(),
  broker public.broker_assignment not null check (broker <> 'unassigned'),
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  mortgage_advisor_name text not null check (length(trim(mortgage_advisor_name)) between 1 and 200),
  institution_name text not null check (length(trim(institution_name)) between 1 and 200),
  follow_up_at timestamptz,
  follow_up_note text not null default '',
  google_event_id text,
  google_calendar_id text,
  google_event_link text,
  event_key uuid not null default gen_random_uuid(),
  operation_token uuid,
  operation_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mortgage_referral_follow_up_consistent check (
    (follow_up_at is null and google_event_id is null and google_calendar_id is null)
    or (follow_up_at is not null and google_event_id is not null and google_calendar_id is not null)
  )
);
create index mortgage_referrals_broker_created_idx on public.mortgage_referrals(broker, created_at desc);
create index mortgage_referrals_transaction_idx on public.mortgage_referrals(transaction_id);
create index mortgage_referrals_created_idx on public.mortgage_referrals(created_at desc);
create index mortgage_referrals_follow_up_idx on public.mortgage_referrals(follow_up_at) where follow_up_at is not null;
alter table public.mortgage_referrals enable row level security;
revoke all on public.mortgage_referrals from anon, authenticated;
grant select, insert, update, delete on public.mortgage_referrals to service_role;
create trigger mortgage_referrals_updated before update on public.mortgage_referrals
for each row execute function public.set_updated_at();

create function public.check_mortgage_referral_broker() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.transactions where id = new.transaction_id and broker = new.broker for share) then
    raise exception 'Le courtier de la référence doit correspondre à la transaction.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger mortgage_referrals_broker_check before insert or update of broker, transaction_id on public.mortgage_referrals
for each row execute function public.check_mortgage_referral_broker();

-- Keep an existing reference and its Google owner stable when editing a transaction.
create function public.protect_mortgage_referral_broker() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.broker is distinct from old.broker and exists (
    select 1 from public.mortgage_referrals where transaction_id = old.id
  ) then
    raise exception 'Supprimez les références hypothécaires avant de changer le courtier.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger transactions_mortgage_referral_broker before update of broker on public.transactions
for each row execute function public.protect_mortgage_referral_broker();
