-- Manual sends only; no scheduler or changes to automatic email tables.
create table public.custom_email_manual_batches (
  id uuid primary key,
  campaign_id uuid not null,
  step_id uuid not null,
  campaign_name text not null,
  step_order integer not null,
  trigger text not null default 'manual' check (trigger = 'manual'),
  created_at timestamptz not null default now()
);
create index custom_email_manual_batches_campaign_idx on public.custom_email_manual_batches(campaign_id, created_at desc);

create table public.custom_email_manual_deliveries (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.custom_email_manual_batches(id),
  campaign_id uuid not null,
  step_id uuid not null,
  contact_id uuid not null,
  broker public.broker_assignment check (broker <> 'unassigned'),
  recipient_email text not null,
  status text not null check (status in ('pending', 'sent', 'failed', 'blocked')),
  attempt_key uuid not null,
  gmail_message_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (step_id, contact_id),
  check (status <> 'sent' or gmail_message_id is not null)
);
create index custom_email_manual_deliveries_batch_idx on public.custom_email_manual_deliveries(batch_id);
create index custom_email_manual_deliveries_campaign_idx on public.custom_email_manual_deliveries(campaign_id, created_at desc);
alter table public.custom_email_manual_batches enable row level security;
alter table public.custom_email_manual_deliveries enable row level security;
revoke all on public.custom_email_manual_batches, public.custom_email_manual_deliveries from public, anon, authenticated;
grant select, insert on public.custom_email_manual_batches to service_role;
grant select, insert, update on public.custom_email_manual_deliveries to service_role;
