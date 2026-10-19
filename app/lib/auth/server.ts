import { createServerClient } from '@supabase/ssr';
import { memberFromDatabase } from './identity';

export function googleLoginEnabled() { return process.env.CRM_GOOGLE_LOGIN_ENABLED === 'true'; }
export function legacyLoginEnabled() { return process.env.LEGACY_SHARED_LOGIN_ENABLED !== 'false'; }
/** Route-handler client: PKCE and refresh cookies are maintained by the official SDK. */
export async function createCRMAuthClient(readOnly = false) {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Configuration Auth indisponible.');
  return createServerClient(url, key, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () => store.getAll(),
      setAll: values => { if (!readOnly) for (const { name, value, options } of values) store.set(name, value, options); },
    },
  });
}
export async function getAuthenticatedMember(readOnly = false) {
  if (!googleLoginEnabled()) return null;
  const client = await createCRMAuthClient(readOnly);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const resolved = await client.rpc('crm_authenticated_member');
  if (resolved.error) throw new Error('Vérification du membre indisponible.');
  const member = memberFromDatabase(resolved.data);
  return member && member.authUserId === data.user.id ? { member, client } : null;
}
