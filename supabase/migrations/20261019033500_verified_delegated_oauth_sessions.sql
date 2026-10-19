-- Supabase delegated sessions use their own AMR, not the upstream Google AMR.
-- Accept them only for an already-bound verified Google member and a live grant.
create or replace function crm_auth.verified_google_identity()
returns setof auth.identities language sql stable security definer set search_path='' as $$
 select i.* from auth.identities i
 join auth.sessions s on s.user_id=i.user_id and s.id::text=auth.jwt()->>'session_id'
 where auth.uid() is not null and i.user_id=auth.uid() and i.provider='google'
 and i.identity_data->>'email_verified'='true' and nullif(i.provider_id,'') is not null
 and (s.not_after is null or s.not_after>now())
 and (auth.jwt()->>'exp')::numeric > extract(epoch from now())
 and (select count(*) from auth.identities other where other.user_id=i.user_id and other.provider='google')=1
 and (
  (s.oauth_client_id is null and nullif(auth.jwt()->>'client_id','') is null
   and exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a where a->>'method'='oauth'))
  or (
   s.oauth_client_id::text=auth.jwt()->>'client_id'
   and exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a where a->>'method'='oauth_provider/authorization_code')
   and exists(select 1 from auth.oauth_consents c join auth.oauth_clients oc on oc.id=c.client_id
     where c.user_id=i.user_id and c.client_id=s.oauth_client_id and c.revoked_at is null and oc.deleted_at is null)
   and exists(select 1 from public.crm_member_auth_identities a join public.crm_members m on m.id=a.member_id
     where a.auth_user_id=i.user_id and a.provider=i.provider and a.provider_subject=i.provider_id
     and a.email_normalized=lower(btrim(i.identity_data->>'email')) and a.active and m.active)
  )
 );
$$;
revoke all on function crm_auth.verified_google_identity() from public,anon,authenticated;
