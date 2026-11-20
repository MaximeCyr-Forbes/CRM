-- Short-lived, single-use OAuth attempts. No plaintext or encrypted Google tokens.
create table public.google_oauth_reauthorizations (
  state_hash text primary key check (length(state_hash) = 64),
  actor_id uuid not null,
  broker text not null check (broker in ('france', 'maxime', 'sandrine')),
  connection_fingerprint text not null check (length(connection_fingerprint) = 64),
  expires_at timestamptz not null
);
alter table public.google_oauth_reauthorizations enable row level security;
revoke all on public.google_oauth_reauthorizations from public, anon, authenticated;
grant select, insert, delete on public.google_oauth_reauthorizations to service_role;
