begin;

create table if not exists public.custom_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft',
  execution_mode text not null default 'approval',
  sender_strategy text not null default 'assigned_broker',
  fixed_broker public.broker_assignment,
  fallback_broker public.broker_assignment,
  start_date date,
  send_hour integer not null default 9,
  send_minute integer not null default 0,
  timezone text not null default 'America/Toronto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_email_campaigns_name_check check (length(trim(name)) between 1 and 160),
  constraint custom_email_campaigns_status_check check (status = any (array['draft', 'ready', 'paused'])),
  constraint custom_email_campaigns_execution_mode_check check (execution_mode = any (array['approval', 'automatic'])),
  constraint custom_email_campaigns_sender_strategy_check check (sender_strategy = any (array['assigned_broker', 'fixed_broker'])),
  constraint custom_email_campaigns_fixed_broker_check check (fixed_broker is null or fixed_broker <> 'unassigned'),
  constraint custom_email_campaigns_fallback_broker_check check (fallback_broker is null or fallback_broker <> 'unassigned'),
  constraint custom_email_campaigns_send_hour_check check (send_hour between 0 and 23),
  constraint custom_email_campaigns_send_minute_check check (send_minute between 0 and 59),
  constraint custom_email_campaigns_timezone_check check (timezone = 'America/Toronto'),
  constraint custom_email_campaigns_ready_configuration_check check (
    status <> 'ready'
    or (
      start_date is not null
      and (
        (sender_strategy = 'assigned_broker' and fallback_broker is not null)
        or (sender_strategy = 'fixed_broker' and fixed_broker is not null)
      )
    )
  )
);

create table if not exists public.custom_email_campaign_contacts (
  campaign_id uuid not null references public.custom_email_campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, contact_id)
);

create table if not exists public.custom_email_campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.custom_email_campaigns(id) on delete cascade,
  step_order integer not null,
  delay_days_after_previous integer not null default 0,
  subject_template text not null default '',
  body_template text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_email_campaign_steps_order_check check (step_order >= 1),
  constraint custom_email_campaign_steps_delay_check check (delay_days_after_previous between 0 and 3650),
  constraint custom_email_campaign_steps_subject_length_check check (length(subject_template) <= 250),
  constraint custom_email_campaign_steps_body_length_check check (length(body_template) <= 100000),
  constraint custom_email_campaign_steps_campaign_order_unique unique (campaign_id, step_order)
);

create index if not exists custom_email_campaigns_start_status_idx
  on public.custom_email_campaigns (start_date, status);
create index if not exists custom_email_campaign_contacts_campaign_idx
  on public.custom_email_campaign_contacts (campaign_id);
create index if not exists custom_email_campaign_steps_campaign_order_idx
  on public.custom_email_campaign_steps (campaign_id, step_order);

drop trigger if exists custom_email_campaigns_set_updated_at on public.custom_email_campaigns;
create trigger custom_email_campaigns_set_updated_at
before update on public.custom_email_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists custom_email_campaign_steps_set_updated_at on public.custom_email_campaign_steps;
create trigger custom_email_campaign_steps_set_updated_at
before update on public.custom_email_campaign_steps
for each row execute function public.set_updated_at();

alter table public.custom_email_campaigns enable row level security;
alter table public.custom_email_campaign_contacts enable row level security;
alter table public.custom_email_campaign_steps enable row level security;

revoke all on public.custom_email_campaigns from public, anon, authenticated;
revoke all on public.custom_email_campaign_contacts from public, anon, authenticated;
revoke all on public.custom_email_campaign_steps from public, anon, authenticated;

grant select, insert, update, delete on public.custom_email_campaigns to service_role;
grant select, insert, update, delete on public.custom_email_campaign_contacts to service_role;
grant select, insert, update, delete on public.custom_email_campaign_steps to service_role;

commit;
