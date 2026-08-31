begin;

alter table public.crm_recommendations
  add column if not exists is_completed boolean not null default false,
  add column if not exists completed_at timestamptz;

alter table public.crm_recommendations
  drop constraint if exists crm_recommendations_completion_check;

alter table public.crm_recommendations
  add constraint crm_recommendations_completion_check
  check (is_completed = (completed_at is not null));

create index if not exists crm_recommendations_completion_created_idx
  on public.crm_recommendations (is_completed, created_at desc);

commit;
