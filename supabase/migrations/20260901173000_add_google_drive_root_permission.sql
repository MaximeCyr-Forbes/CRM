begin;

alter table public.google_drive_roots
  add column if not exists google_permission_id text;

alter table public.google_drive_roots
  drop constraint if exists google_drive_roots_google_permission_id_check;

alter table public.google_drive_roots
  add constraint google_drive_roots_google_permission_id_check
  check (
    google_permission_id is null
    or length(trim(google_permission_id)) between 1 and 200
  );

commit;
