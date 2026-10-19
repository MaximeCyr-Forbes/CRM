import { cookies } from 'next/headers';
import { CRM_ACCESS_COOKIE } from '../../../lib/crm-access';
import { createCRMAuthClient, googleLoginEnabled } from '../../../lib/auth/server';
import { safeReturnPath } from '../../../lib/auth/identity';
import { isSameOriginRequest } from '../../../lib/google-calendar/config';
import { clearGoogleSession } from '../../../lib/auth/google-session';
import { authEvent } from '../../../lib/auth/events';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: 'Origine refusée.' }, { status: 403 });
  if (!googleLoginEnabled()) return Response.json({ error: 'Connexion Google en préparation.' }, { status: 503 });
  const body = await request.json().catch(() => null);
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (!origin || new URL(origin).protocol !== 'https:') return Response.json({ error: 'Configuration de connexion indisponible.' }, { status: 503 });
  const store = await cookies();
  store.set('crm_auth_return', safeReturnPath(body?.returnTo), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 });
  try {
    await clearGoogleSession();
    authEvent('GOOGLE_AUTH_START');
    const client = await createCRMAuthClient();
    const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: {
      redirectTo: `${origin}/api/access/callback`, scopes: 'openid email profile',
      skipBrowserRedirect: true, queryParams: { prompt: 'select_account' },
    } });
    if (error || !data.url) throw new Error('OAuth unavailable');
    store.delete(CRM_ACCESS_COOKIE);
    return Response.json({ url: data.url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Impossible de démarrer la connexion Google.' }, { status: 503 }); }
}
