-- Same server-only access model as transactions and transaction_notes.
create table public.transaction_direct_clients (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  phone text check (length(phone) <= 80),
  email text check (length(email) <= 254),
  source text check (length(source) <= 80),
  request_date date,
  request_note text check (length(request_note) <= 4000),
  created_at timestamptz not null default now(),
  created_by text not null check (created_by in ('france', 'maxime', 'sandrine', 'immoplus')),
  updated_at timestamptz not null default now(),
  updated_by text not null check (updated_by in ('france', 'maxime', 'sandrine', 'immoplus'))
);
create index transaction_direct_clients_transaction_idx
  on public.transaction_direct_clients (transaction_id, created_at desc, id);
alter table public.transaction_direct_clients enable row level security;
revoke all on public.transaction_direct_clients from public, anon, authenticated;
grant select, insert, update, delete on public.transaction_direct_clients to service_role;
