import { createCRMAuthClient, googleLoginEnabled } from '../../../../lib/auth/server';
import { verifyCRMPassword } from '../../../../lib/crm-access';
import { getSupabaseServiceClient } from '../../../../lib/supabase/server';
import { isSameOriginRequest } from '../../../../lib/google-calendar/config';
import { authEvent } from '../../../../lib/auth/events';
const headers = { 'Cache-Control': 'private, no-store' };
async function state() {
  if (!googleLoginEnabled()) return null;
  const client = await createCRMAuthClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const result = await client.rpc('crm_google_login_state');
  if (result.error) throw new Error('Identity unavailable');
  if (result.data?.status === 'link_required' && result.data.auth_user_id !== data.user.id) return null;
  return result.data;
}
export async function GET() {
  try {
    const result = await state();
    // Internal identity/session identifiers are never needed by the browser.
    return Response.json({ status: result?.status ?? 'invalid', members: result?.status === 'link_required' ? result.members : [] }, { headers });
  } catch { return Response.json({ error: 'Vérification temporairement indisponible. Réessayez ou utilisez la connexion de secours.' }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: 'Origine refusée.' }, { status: 403, headers });
  try {
    const body = await request.json().catch(() => null);
    const current = await state();
    if (current?.status !== 'link_required') return Response.json({ error: 'Relancez la connexion Google pour associer votre compte.' }, { status: 400, headers });
    const attempt = await getSupabaseServiceClient().rpc('crm_google_link_attempt', { p_user: current.auth_user_id });
    if (attempt.error || attempt.data !== true) return Response.json({ error: 'Trop de tentatives. Réessayez dans 15 minutes ou utilisez la connexion de secours.' }, { status: 429, headers });
    if (typeof body?.password !== 'string' || !await verifyCRMPassword(body.password)) {
      authEvent('MEMBER_LINK_FAILED');
      return Response.json({ error: 'Mot de passe de secours incorrect.' }, { status: 401, headers });
    }
    if (!current.members?.some((member: { id: string }) => member.id === body?.memberId)) return Response.json({ error: 'Choisissez votre profil dans la liste.' }, { status: 400, headers });
    const linked = await getSupabaseServiceClient().rpc('crm_confirm_google_link', {
      p_user: current.auth_user_id, p_identity: current.google_identity_id, p_session: current.session_id, p_member: body.memberId,
    });
    if (linked.error || linked.data !== true) throw new Error('Link failed');
    authEvent('MEMBER_LINK_SUCCESS');
    return Response.json({ linked: true }, { headers });
  } catch { authEvent('MEMBER_LINK_FAILED'); return Response.json({ error: 'Association indisponible. Réessayez ou utilisez la connexion de secours.' }, { status: 503, headers }); }
}
