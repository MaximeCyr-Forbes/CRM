begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Deployment supplies this secret to Vault and Vercel; no credential in Git.
create function public.invoke_birthday_scheduler()
returns bigint language plpgsql security invoker set search_path=public as $$
declare v_secret text; v_request bigint;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='crm_birthday_cron_secret';
  if v_secret is null then return null; end if;
  select net.http_get(
    url:='https://crm-eight-beryl-72.vercel.app/api/cron/birthday-greetings',
    headers:=jsonb_build_object('Authorization','Bearer '||v_secret),
    timeout_milliseconds:=120000
  ) into v_request;
  return v_request;
end $$;
revoke execute on function public.invoke_birthday_scheduler() from public,anon,authenticated;
select cron.schedule('crm-birthday-5pm-fallback','*/5 * * * *','select public.invoke_birthday_scheduler()');
-- Initially inactive until the authenticated endpoint is deployed and verified.
select cron.alter_job((select jobid from cron.job where jobname='crm-birthday-5pm-fallback'),active:=false);
commit;
