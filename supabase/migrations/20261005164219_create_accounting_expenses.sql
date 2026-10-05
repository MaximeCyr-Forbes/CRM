create table public.accounting_expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('marketing','operation')),
  expense_date date not null,
  vendor text not null check (length(trim(vendor)) between 1 and 200),
  description text not null check (length(trim(description)) between 1 and 1000),
  amount numeric(12,2) not null check (amount >= 0),
  notes text not null default '' check (length(notes) <= 5000),
  created_by text not null check (created_by in ('france','maxime','sandrine','immoplus')),
  updated_by text not null check (updated_by in ('france','maxime','sandrine','immoplus')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  operation_token uuid,
  operation_until timestamptz
);
create index accounting_expenses_date_idx on public.accounting_expenses (expense_date desc, created_at desc);
create index accounting_expenses_category_date_idx on public.accounting_expenses (category, expense_date desc);

-- Every issued upload URL has a durable record, including interrupted uploads.
-- Retired records are kept until their two-hour upload authorization expires,
-- so a late client upload is still tracked and removed on controlled cleanup.
create table public.accounting_expense_documents (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid references public.accounting_expenses(id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size integer not null check (size between 1 and 15728640),
  state text not null default 'pending' check (state in ('pending','current','retired')),
  upload_expires_at timestamptz not null default (now() + interval '125 minutes'),
  uploaded_at timestamptz not null default now()
);
create unique index accounting_one_current_invoice on public.accounting_expense_documents(expense_id) where state = 'current';
create index accounting_documents_expense_idx on public.accounting_expense_documents(expense_id);
create index accounting_documents_cleanup_idx on public.accounting_expense_documents(upload_expires_at) where state <> 'current';
alter table public.accounting_expenses enable row level security;
alter table public.accounting_expense_documents enable row level security;
revoke all on public.accounting_expenses, public.accounting_expense_documents from anon, authenticated;
grant all on public.accounting_expenses, public.accounting_expense_documents to service_role;

-- Both transitions are atomic; storage cleanup follows, with durable retry state.
create function public.accounting_promote_invoice(p_expense uuid, p_document uuid, p_token uuid, p_actor text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from accounting_expenses where id=p_expense and operation_token=p_token and operation_until>now() for update;
  if not found then raise exception 'Accounting operation expired'; end if;
  perform 1 from accounting_expense_documents where id=p_document and expense_id=p_expense and state='pending';
  if not found then raise exception 'Invoice unavailable'; end if;
  update accounting_expense_documents set state='retired' where expense_id=p_expense and state='current';
  update accounting_expense_documents set state='current', uploaded_at=now() where id=p_document;
  update accounting_expenses set updated_by=p_actor, updated_at=now() where id=p_expense;
end $$;
revoke all on function public.accounting_promote_invoice(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.accounting_promote_invoice(uuid,uuid,uuid,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('accounting-invoices','accounting-invoices',false,15728640,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
