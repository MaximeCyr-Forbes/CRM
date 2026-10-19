import { getAuthenticatedMember } from '../../../lib/auth/server';
import { isSameOriginRequest } from '../../../lib/google-calendar/config';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
function validAuthorization(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z0-9_-]{10,200}$/.test(value); }
function safeOAuthRedirect(value: string) { const url = new URL(value); if (url.protocol !== 'https:') throw new Error('Invalid OAuth redirect'); return url.toString(); }
export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedMember();
    if (!auth) return Response.json({ error: 'Connectez-vous avec votre compte Google autorisé.' }, { status: 401, headers });
    const id = new URL(request.url).searchParams.get('authorization_id');
    if (!validAuthorization(id)) return Response.json({ error: 'Demande de connexion invalide.' }, { status: 400, headers });
    const { data, error } = await auth.client.auth.oauth.getAuthorizationDetails(id);
    if (error || !data) throw new Error('Authorization unavailable');
    if ('redirect_url' in data) return Response.json({ redirect: safeOAuthRedirect(data.redirect_url) }, { headers });
    if (data.user.id !== auth.member.authUserId || data.scope.split(' ').some(scope => !['openid','email','profile','offline_access'].includes(scope))) throw new Error('Unexpected authorization');
    return Response.json({ clientName: data.client.name, clientUri: data.client.uri, broker: auth.member.broker, role: auth.member.role }, { headers });
  } catch { return Response.json({ error: 'Cette demande a expiré ou ne peut pas être autorisée. Relancez la connexion depuis ChatGPT.' }, { status: 400, headers }); }
}
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: 'Origine refusée.' }, { status: 403, headers });
  try {
    const auth = await getAuthenticatedMember();
    if (!auth) return Response.json({ error: 'Connexion Google individuelle requise.' }, { status: 401, headers });
    const body = await request.json();
    if (!validAuthorization(body?.authorization_id) || !['approve','deny'].includes(body?.decision)) throw new Error('Invalid request');
    const details = await auth.client.auth.oauth.getAuthorizationDetails(body.authorization_id);
    if (details.error || !details.data) throw new Error('Invalid authorization');
    if ('authorization_id' in details.data && (details.data.user.id !== auth.member.authUserId || details.data.scope.split(' ').some(scope => !['openid','email','profile','offline_access'].includes(scope)))) throw new Error('Unexpected authorization');
    const result = body.decision === 'approve'
      ? await auth.client.auth.oauth.approveAuthorization(body.authorization_id, { skipBrowserRedirect: true })
      : await auth.client.auth.oauth.denyAuthorization(body.authorization_id, { skipBrowserRedirect: true });
    if (result.error || !result.data) throw new Error('Consent unavailable');
    return Response.json({ redirect: safeOAuthRedirect(result.data.redirect_url) }, { headers });
  } catch { return Response.json({ error: 'Impossible de terminer cette demande. Relancez la connexion depuis ChatGPT.' }, { status: 400, headers }); }
}
