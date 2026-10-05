-- Preserve the private invoice workflow; incomplete expenses are a supported inbox state.
alter table public.accounting_expenses
  add column is_paid boolean not null default false,
  add column paid_at timestamptz,
  add column renewal_date date,
  alter column category drop not null,
  alter column expense_date drop not null,
  alter column vendor drop not null,
  alter column description drop not null,
  alter column amount drop not null,
  add constraint accounting_expenses_payment_consistent check (
    (is_paid and paid_at is not null) or (not is_paid and paid_at is null)
  );
