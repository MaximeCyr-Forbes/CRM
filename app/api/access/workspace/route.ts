import { withCRMIdentity } from '../../../lib/auth/route';
import { crmMemberContext } from '../../../lib/auth/context';
import { createWorkspaceToken, requireApiAccess } from "../../../lib/crm-access";
import { isWorkspaceUser } from "../../../lib/workspace";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
async function POSTHandler(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!isWorkspaceUser(body?.workspaceUser)) return Response.json({ error: "Utilisateur invalide." }, { status: 400 });
  return Response.json({ token: await createWorkspaceToken(crmMemberContext.getStore()?.broker ?? body.workspaceUser) }, { headers: { "Cache-Control": "private, no-store" } });
}

export const POST = withCRMIdentity(POSTHandler);
