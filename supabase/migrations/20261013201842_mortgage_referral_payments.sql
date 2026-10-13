-- Additive: existing referrals remain unpaid; no legacy data is rewritten.
alter table public.mortgage_referrals
  add column paid_amount numeric(12,2),
  add column paid_at date,
  add column payment_updated_at timestamptz,
  add column payment_updated_by text,
  add column payment_version integer not null default 0,
  add constraint mortgage_referral_payment_consistent check (
    (paid_at is null and paid_amount is null) or
    (paid_at is not null and paid_amount is not null and paid_amount > 0 and paid_amount <= 9999999999.99
      and paid_at between date '1900-01-01' and date '9999-12-31'
      and payment_updated_at is not null and payment_updated_by is not null)
  );

-- One current payment per referral, serialized with row locks and optimistic versions.
-- SECURITY INVOKER: only the existing server role can execute this function.
create function public.mortgage_referral_payment(
  p_id uuid, p_broker public.broker_assignment, p_amount numeric, p_date date,
  p_version integer, p_actor text
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare r public.mortgage_referrals;
begin
  if p_actor is null or p_actor not in ('maxime','france','sandrine','immoplus') then
    raise exception 'Utilisateur invalide.';
  end if;
  if p_actor not in ('maxime','immoplus') and p_actor <> p_broker::text then
    raise exception 'Ce paiement appartient à un autre courtier.';
  end if;
  if (p_amount is null) <> (p_date is null) or
     (p_amount is not null and (p_amount <= 0 or p_amount > 9999999999.99 or p_amount <> round(p_amount,2))) then
    raise exception 'Indiquez le montant réellement reçu pour confirmer le paiement.';
  end if;
  if p_date is not null and (p_date < date '1900-01-01' or p_date > date '9999-12-31') then
    raise exception 'Date du paiement invalide.';
  end if;
  select * into r from public.mortgage_referrals where id=p_id and broker=p_broker for update;
  if not found or not exists(select 1 from public.transactions where id=r.transaction_id and broker=p_broker) then
    raise exception 'Référence indisponible pour ce courtier.';
  end if;
  if r.operation_until > now() then
    raise exception 'Une opération est en cours. Réessayez.';
  end if;
  if p_version is null or r.payment_version <> p_version then
    raise exception 'Le paiement a changé. Fermez cette fenêtre et actualisez la page avant de réessayer.';
  end if;
  update public.mortgage_referrals set paid_amount=p_amount,paid_at=p_date,
    payment_updated_at=clock_timestamp(),payment_updated_by=p_actor,payment_version=payment_version+1
    where id=p_id returning * into r;
  return jsonb_build_object('id',r.id,'paid_amount',r.paid_amount,'paid_at',r.paid_at,
    'payment_updated_at',r.payment_updated_at,'payment_updated_by',r.payment_updated_by,'payment_version',r.payment_version);
end;
$$;
revoke all on function public.mortgage_referral_payment(uuid,public.broker_assignment,numeric,date,integer,text) from public,anon,authenticated;
grant execute on function public.mortgage_referral_payment(uuid,public.broker_assignment,numeric,date,integer,text) to service_role;
