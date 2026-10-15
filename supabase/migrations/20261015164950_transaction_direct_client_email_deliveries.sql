-- Delivery receipts and atomic claims for manually composed transaction email.
-- Gmail remains the message history; no message body or phone is stored here.
create table public.transaction_direct_client_email_deliveries (
 id uuid primary key default gen_random_uuid(),
 batch_id uuid not null,
 transaction_id uuid not null references public.transactions(id) on delete cascade,
 direct_client_id uuid references public.transaction_direct_clients(id) on delete set null,
 actor text not null check (actor in ('maxime','france','sandrine','immoplus')),
 sender_broker text not null check (sender_broker in ('maxime','france','sandrine')),
 payload_hash text not null,
 recipient_name text not null,
 recipient_email text not null,
 normalized_email text not null,
 subject text not null,
 status text not null default 'pending' check (status in ('pending','sending','sent','failed','uncertain')),
 gmail_message_id text,
 error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(batch_id, normalized_email),
 check (status <> 'sent' or gmail_message_id is not null)
);
create index direct_client_email_transaction_idx on public.transaction_direct_client_email_deliveries(transaction_id,created_at desc);
create index direct_client_email_client_idx on public.transaction_direct_client_email_deliveries(direct_client_id);
alter table public.transaction_direct_client_email_deliveries enable row level security;
revoke all on public.transaction_direct_client_email_deliveries from public,anon,authenticated;
grant select,insert,update on public.transaction_direct_client_email_deliveries to service_role;
