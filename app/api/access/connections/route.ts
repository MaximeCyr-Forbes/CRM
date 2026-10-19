import { getAuthenticatedMember } from '../../../lib/auth/server';
import { isSameOriginRequest } from '../../../lib/google-calendar/config';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function GET() {
 try {
  const auth = await getAuthenticatedMember();
  if (!auth) return Response.json({ error: 'Connexion Google individuelle requise.' }, { status: 401, headers });
  const { data, error } = await auth.client.auth.oauth.listGrants();
  if (error) throw error;
  return Response.json({ connections: (data ?? []).map(grant => ({ id: grant.client.id, name: grant.client.name, grantedAt: grant.granted_at })) }, { headers });
 } catch { return Response.json({ error: 'Connexions temporairement indisponibles.' }, { status: 503, headers }); }
}
export async function DELETE(request: Request) {
 if (!isSameOriginRequest(request)) return Response.json({ error: 'Origine refusée.' }, { status: 403, headers });
 try {
  const auth = await getAuthenticatedMember();
  if (!auth) return Response.json({ error: 'Connexion Google individuelle requise.' }, { status: 401, headers });
  const body = await request.json();
  if (typeof body?.clientId !== 'string' || !/^[a-zA-Z0-9_-]{10,200}$/.test(body.clientId)) return Response.json({ error: 'Application invalide.' }, { status: 400, headers });
  const { error } = await auth.client.auth.oauth.revokeGrant({ clientId: body.clientId });
  if (error) throw error;
  return Response.json({ revoked: true }, { headers });
 } catch { return Response.json({ error: 'Révocation non confirmée. Réessayez.' }, { status: 503, headers }); }
}
