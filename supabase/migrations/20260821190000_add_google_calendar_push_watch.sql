begin;

create table if not exists public.google_calendar_watch_channels (
  broker public.broker_assignment primary key,
  calendar_id text not null default 'primary',
  channel_id text not null unique,
  resource_id text,
  token_hash text not null,
  expires_at timestamptz,
  change_version bigint not null default 0,
  last_notification_at timestamptz,
  last_resource_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_watch_channels_assigned_broker_check
    check (broker <> 'unassigned'),
  constraint google_calendar_watch_channels_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$')
);

drop trigger if exists google_calendar_watch_channels_set_updated_at
on public.google_calendar_watch_channels;
create trigger google_calendar_watch_channels_set_updated_at
before update on public.google_calendar_watch_channels
for each row execute function public.set_updated_at();

create or replace function public.notify_google_calendar_change(
  p_channel_id text,
  p_resource_id text,
  p_resource_state text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change_version bigint;
begin
  if p_resource_state not in ('sync', 'exists', 'not_exists') then
    return null;
  end if;

  update public.google_calendar_watch_channels
  set
    resource_id = case
      when resource_id is null and p_resource_state = 'sync' then p_resource_id
      else resource_id
    end,
    change_version = change_version + case
      when p_resource_state in ('exists', 'not_exists') then 1
      else 0
    end,
    last_notification_at = now(),
    last_resource_state = p_resource_state
  where channel_id = p_channel_id
    and (
      resource_id = p_resource_id
      or (resource_id is null and p_resource_state = 'sync')
    )
  returning change_version into v_change_version;

  return v_change_version;
end;
$$;

alter table public.google_calendar_watch_channels enable row level security;

revoke all on public.google_calendar_watch_channels from public, anon, authenticated;
revoke execute on function public.notify_google_calendar_change(text, text, text)
from public, anon, authenticated;

grant select, insert, update, delete
on public.google_calendar_watch_channels to service_role;
grant execute on function public.notify_google_calendar_change(text, text, text)
to service_role;

commit;
