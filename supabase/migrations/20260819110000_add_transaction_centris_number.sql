alter table public.transactions
  add column if not exists centris_number text not null default '';
