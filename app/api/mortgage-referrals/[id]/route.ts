import { requireApiAccess } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { mutateReferral } from "../../../lib/mortgage-referrals/server";
import { ReferralError } from "../../../lib/mortgage-referrals/validation";
import { referralResponseError } from "../route";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function mutate(request: Request, context: Context, remove: boolean) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ReferralError("Requête invalide.");
    return Response.json({ data: await mutateReferral((await context.params).id, body, remove) });
  } catch (error) { return referralResponseError(error); }
}
export function PATCH(request: Request, context: Context) { return mutate(request, context, false); }
export function DELETE(request: Request, context: Context) { return mutate(request, context, true); }
