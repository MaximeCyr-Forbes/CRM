import { cookies } from 'next/headers';
import { createCRMAuthClient, googleLoginEnabled } from '../../../lib/auth/server';
import { memberFromDatabase, safeReturnPath } from '../../../lib/auth/identity';
import { clearGoogleSession } from '../../../lib/auth/google-session';
import { authEvent } from '../../../lib/auth/events';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (!origin) return new Response('Configuration indisponible', { status: 503 });
  const redirect = (path: string) => new Response(null, { status: 303, headers: { Location: `${origin}${path}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  if (!googleLoginEnabled()) return redirect('/login?authError=unavailable');
  const store = await cookies();
  const returnTo = safeReturnPath(store.get('crm_auth_return')?.value);
  store.set('crm_auth_return', '', { path: '/', maxAge: 0 });
  const url = new URL(request.url);
  const failed = async (reason: string) => { await clearGoogleSession(); return redirect(`/login?authError=${reason}&returnTo=${encodeURIComponent(returnTo)}`); };
  if (url.searchParams.has('error')) return failed('cancelled');
  const code = url.searchParams.get('code');
  if (!code) return failed('failed');
  try {
    const client = await createCRMAuthClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return failed('failed');
    authEvent('GOOGLE_AUTH_SUCCESS');
    const binding = await client.rpc('crm_google_login_state');
    if (binding.error) return failed('failed');
    if (binding.data?.status === 'domain_denied') return failed('domain');
    if (binding.data?.status === 'link_required') {
      authEvent('DOMAIN_ACCEPTED'); authEvent('MEMBER_LINK_REQUIRED');
      return redirect(`/login?link=1&returnTo=${encodeURIComponent(returnTo)}`);
    }
    if (!memberFromDatabase(binding.data?.member)) return failed('unauthorized');
    authEvent('DOMAIN_ACCEPTED');
    authEvent(binding.data.resolution === 'sub' ? 'MEMBER_MATCH_SUB' : binding.data.resolution === 'exact' ? 'MEMBER_MATCH_EXACT' : 'MEMBER_MATCH_PROFILE');
    authEvent('CRM_SESSION_READY');
    // No access to Gmail, Drive or Calendar; their broker connections stay independent.
    return redirect(returnTo);
  } catch { return failed('failed'); }
}
