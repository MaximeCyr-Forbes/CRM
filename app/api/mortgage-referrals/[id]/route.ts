import { withCRMIdentity } from '../../../lib/auth/route';
import { birthdayWorkspaceActor, requireApiAccess } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { mutateReferral } from "../../../lib/mortgage-referrals/server";
import { ReferralError } from "../../../lib/mortgage-referrals/validation";
import { referralResponseError } from "../route";
import { saveReferralPayment } from "../../../lib/mortgage-referrals/payment-server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function mutate(request: Request, context: Context, remove: boolean) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ReferralError("Requête invalide.");
    if (!remove && (body.action === "payment" || body.action === "cancel-payment")) {
      return Response.json({ data: await saveReferralPayment((await context.params).id, body, await birthdayWorkspaceActor(request)) });
    }
    return Response.json({ data: await mutateReferral((await context.params).id, body, remove) });
  } catch (error) { return referralResponseError(error); }
}
function PATCHHandler(request: Request, context: Context) { return mutate(request, context, false); }
function DELETEHandler(request: Request, context: Context) { return mutate(request, context, true); }

export const PATCH = withCRMIdentity(PATCHHandler);
export const DELETE = withCRMIdentity(DELETEHandler);