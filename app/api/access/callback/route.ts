import { cookies } from 'next/headers';
import { createCRMAuthClient, googleLoginEnabled } from '../../../lib/auth/server';
import { memberFromDatabase, safeReturnPath } from '../../../lib/auth/identity';
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
  if (url.searchParams.has('error')) return redirect('/login?authError=cancelled');
  const code = url.searchParams.get('code');
  if (!code) return redirect('/login?authError=failed');
  try {
    const client = await createCRMAuthClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return redirect('/login?authError=failed');
    const binding = await client.rpc('crm_bind_google_identity');
    if (binding.error || !memberFromDatabase(binding.data)) {
      await client.auth.signOut({ scope: 'local' });
      return redirect('/login?authError=unauthorized');
    }
    // No access to Gmail, Drive or Calendar; their broker connections stay independent.
    return redirect(returnTo);
  } catch { return redirect('/login?authError=failed'); }
}
