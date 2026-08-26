begin;

alter table public.transaction_deadlines
  add column if not exists due_time time without time zone;

commit;
