begin;

create table if not exists public.google_drive_roots (
  id uuid primary key default gen_random_uuid(),
  broker public.broker_assignment not null,
  folder_id text not null,
  folder_name text not null,
  drive_id text,
  web_view_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_drive_roots_assigned_broker_check check (broker <> 'unassigned'),
  constraint google_drive_roots_folder_id_check check (length(trim(folder_id)) between 5 and 200),
  constraint google_drive_roots_folder_name_check check (length(trim(folder_name)) between 1 and 500),
  constraint google_drive_roots_broker_folder_unique unique (broker, folder_id)
);

drop trigger if exists google_drive_roots_set_updated_at on public.google_drive_roots;
create trigger google_drive_roots_set_updated_at
before update on public.google_drive_roots
for each row execute function public.set_updated_at();

alter table public.google_drive_roots enable row level security;

revoke all on public.google_drive_roots from public, anon, authenticated;
grant select, insert, update, delete on public.google_drive_roots to service_role;

commit;
