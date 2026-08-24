begin;

create table if not exists public.automatic_email_rules (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null,
  name text not null,
  status text not null default 'draft',
  execution_mode text not null default 'approval',
  default_broker public.broker_assignment,
  subject_template text not null default '',
  body_template text not null default '',
  send_hour integer not null default 9,
  send_minute integer not null default 0,
  timezone text not null default 'America/Toronto',
  trigger_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automatic_email_rules_rule_type_check
    check (rule_type = any (array['birthday', 'mortgage_renewal', 'purchase_anniversary', 'google_review'])),
  constraint automatic_email_rules_rule_type_unique unique (rule_type),
  constraint automatic_email_rules_name_check check (length(trim(name)) between 1 and 120),
  constraint automatic_email_rules_status_check check (status = any (array['draft', 'ready', 'paused'])),
  constraint automatic_email_rules_execution_mode_check check (execution_mode = any (array['automatic', 'approval'])),
  constraint automatic_email_rules_default_broker_check check (default_broker is null or default_broker <> 'unassigned'),
  constraint automatic_email_rules_subject_length_check check (length(subject_template) <= 250),
  constraint automatic_email_rules_body_length_check check (length(body_template) <= 100000),
  constraint automatic_email_rules_send_hour_check check (send_hour between 0 and 23),
  constraint automatic_email_rules_send_minute_check check (send_minute between 0 and 59),
  constraint automatic_email_rules_timezone_check check (timezone = 'America/Toronto'),
  constraint automatic_email_rules_trigger_config_check check (jsonb_typeof(trigger_config) = 'object'),
  constraint automatic_email_rules_ready_configuration_check check (
    status <> 'ready'
    or (
      default_broker is not null
      and length(trim(subject_template)) > 0
      and length(trim(body_template)) > 0
      and (rule_type <> 'google_review' or length(trim(coalesce(trigger_config->>'googleReviewUrl', ''))) > 0)
    )
  )
);

create table if not exists public.automatic_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.automatic_email_rules(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  broker public.broker_assignment not null,
  recipient_email text not null,
  occurrence_key text not null,
  scheduled_for timestamptz not null,
  status text not null default 'preview',
  gmail_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automatic_email_deliveries_broker_check check (broker <> 'unassigned'),
  constraint automatic_email_deliveries_recipient_check check (length(trim(recipient_email)) between 3 and 320),
  constraint automatic_email_deliveries_occurrence_key_check check (length(trim(occurrence_key)) between 1 and 500),
  constraint automatic_email_deliveries_status_check check (status = any (array['preview', 'queued', 'cancelled'])),
  constraint automatic_email_deliveries_no_delivery_metadata_check check (gmail_message_id is null and error_message is null),
  constraint automatic_email_deliveries_rule_occurrence_unique unique (rule_id, occurrence_key)
);

create index if not exists automatic_email_deliveries_scheduled_idx
  on public.automatic_email_deliveries (scheduled_for, status);
create index if not exists automatic_email_deliveries_contact_idx
  on public.automatic_email_deliveries (contact_id, scheduled_for desc)
  where contact_id is not null;
create index if not exists automatic_email_deliveries_transaction_idx
  on public.automatic_email_deliveries (transaction_id, scheduled_for desc)
  where transaction_id is not null;

drop trigger if exists automatic_email_rules_set_updated_at on public.automatic_email_rules;
create trigger automatic_email_rules_set_updated_at
before update on public.automatic_email_rules
for each row execute function public.set_updated_at();

drop trigger if exists automatic_email_deliveries_set_updated_at on public.automatic_email_deliveries;
create trigger automatic_email_deliveries_set_updated_at
before update on public.automatic_email_deliveries
for each row execute function public.set_updated_at();

insert into public.automatic_email_rules (
  rule_type, name, status, execution_mode, default_broker,
  subject_template, body_template, send_hour, send_minute, timezone, trigger_config
)
values
  (
    'birthday', 'Bonne fête', 'draft', 'approval', null,
    'Bonne fête {{firstName}}! 🎉',
    E'Bonjour {{firstName}},\n\nToute l''Équipe Forbes te souhaite une très belle journée et une excellente année à venir!',
    9, 0, 'America/Toronto', '{}'::jsonb
  ),
  (
    'mortgage_renewal', 'Renouvellement hypothécaire', 'draft', 'approval', null,
    'Votre renouvellement hypothécaire approche',
    E'Bonjour {{firstName}},\n\nVotre renouvellement hypothécaire du {{mortgageRenewalDate}} approche. Souhaitez-vous faire le point sur vos projets immobiliers?',
    9, 0, 'America/Toronto', '{"leadMonths": 6}'::jsonb
  ),
  (
    'purchase_anniversary', 'Anniversaire d’achat', 'draft', 'approval', null,
    'Un anniversaire immobilier à souligner',
    E'Bonjour {{firstName}},\n\nNous tenions à souligner l''anniversaire de votre achat conclu le {{purchaseDate}}. Nous espérons que vous profitez pleinement de votre propriété!',
    9, 0, 'America/Toronto', '{}'::jsonb
  ),
  (
    'google_review', 'Demande d’avis Google', 'draft', 'approval', null,
    'Votre avis compte pour nous',
    E'Bonjour {{firstName}},\n\nMerci de nous avoir fait confiance. Si vous le souhaitez, vous pouvez partager votre expérience ici : {{googleReviewUrl}}',
    9, 0, 'America/Toronto', '{"delayDays": 3}'::jsonb
  )
on conflict (rule_type) do nothing;

alter table public.automatic_email_rules enable row level security;
alter table public.automatic_email_deliveries enable row level security;

revoke all on public.automatic_email_rules from public, anon, authenticated;
revoke all on public.automatic_email_deliveries from public, anon, authenticated;
grant select, insert, update on public.automatic_email_rules to service_role;
grant select, insert, update on public.automatic_email_deliveries to service_role;

commit;
