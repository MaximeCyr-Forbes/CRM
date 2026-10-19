import { createCRMAuthClient, googleLoginEnabled } from '../../../lib/auth/server';
import { clearCRMAccessCookie } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }
  if (googleLoginEnabled()) {
    const client = await createCRMAuthClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error && error.status !== 403) return Response.json({ error: "Déconnexion impossible." }, { status: 503 });
  }
  await clearCRMAccessCookie();
  return Response.json(
    { authenticated: false },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
