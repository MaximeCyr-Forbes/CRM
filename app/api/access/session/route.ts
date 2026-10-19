import { hasCRMAccess } from '../../../lib/crm-access';
import { getAuthenticatedMember, googleLoginEnabled, legacyLoginEnabled } from '../../../lib/auth/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const auth = await getAuthenticatedMember();
    return Response.json({ authenticated: Boolean(auth) || await hasCRMAccess(), member: auth?.member ?? null,
      googleEnabled: googleLoginEnabled(), legacyEnabled: legacyLoginEnabled() }, { headers });
  } catch {
    return Response.json({ authenticated: false, member: null, googleEnabled: googleLoginEnabled(),
      legacyEnabled: legacyLoginEnabled(), error: 'Accès temporairement indisponible.' }, { status: 503, headers });
  }
}
