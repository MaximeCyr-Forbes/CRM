begin;

create table if not exists public.crm_recommendations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  submitted_by public.broker_assignment not null,
  status text not null default 'unread',
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  opened_by public.broker_assignment,
  constraint crm_recommendations_title_length_check
    check (length(trim(title)) between 1 and 120),
  constraint crm_recommendations_content_length_check
    check (length(trim(content)) between 1 and 4000),
  constraint crm_recommendations_submitted_by_check
    check (submitted_by <> 'unassigned'),
  constraint crm_recommendations_status_check
    check (status = any (array['unread', 'read'])),
  constraint crm_recommendations_opened_by_check
    check (opened_by is null or opened_by <> 'unassigned')
);

create index if not exists crm_recommendations_created_at_idx
  on public.crm_recommendations (created_at desc);

create index if not exists crm_recommendations_status_created_idx
  on public.crm_recommendations (status, created_at desc);

alter table public.crm_recommendations enable row level security;

revoke all on public.crm_recommendations from public, anon, authenticated;
grant select, insert, update on public.crm_recommendations to service_role;

commit;
