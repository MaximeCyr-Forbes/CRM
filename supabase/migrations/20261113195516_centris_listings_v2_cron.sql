-- Additive only. Production Vault values and job activation are provisioned separately.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

alter table public.centris_sync_runs alter column actor drop not null;
alter table public.centris_sync_runs add column trigger_source text not null default 'manual'
 check (trigger_source in ('manual','cron'));

create or replace function public.centris_start_sync(p_run uuid,p_actor uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.centris_sync_state set run_id=p_run,lock_until=now()+interval '10 minutes',
 last_started_at=now(),status='running',last_error=null where id and (lock_until is null or lock_until<now());
 if not found then return false; end if;
 update public.centris_sync_runs set status='failed',completed_at=now(),error_summary='Synchronisation interrompue.' where status='running';
 insert into public.centris_sync_runs(id,actor,status,trigger_source)
 values(p_run,p_actor,'running',case when p_actor is null then 'cron' else 'manual' end);
 return true;
end $$;
revoke all on function public.centris_start_sync(uuid,uuid) from public,anon,authenticated;
grant execute on function public.centris_start_sync(uuid,uuid) to service_role;
