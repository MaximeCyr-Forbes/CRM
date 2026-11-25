import { withCRMIdentity } from "../../../../lib/auth/route";
import { crmMemberContext } from "../../../../lib/auth/context";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { completeContactFollowUp, readFollowUpHistory, revertContactFollowUp, syncCompletedFollowUp } from "../../../../lib/contacts/follow-up-completions";
type Context = { params: Promise<{ contactId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  const code = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (code.includes("FORBIDDEN")) return Response.json({ error: "Contact inaccessible ou identité authentifiée requise." }, { status: 403 });
  if (code.includes("STALE")) return Response.json({ error: "La relance a changé dans une autre session. Actualisez la fiche avant de confirmer." }, { status: 409 });
  return Response.json({ error: "L’opération n’a pas pu être confirmée. Actualisez la fiche avant de réessayer." }, { status: 503 });
}
async function GETHandler(_request: Request, context: Context) {
  if (!crmMemberContext.getStore()) return failure(new Error("FORBIDDEN"));
  const { contactId } = await context.params;
  if (!uuid.test(contactId)) return Response.json({ error: "Contact invalide." }, { status: 400 });
  try { return Response.json({ history: await readFollowUpHistory(contactId) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return failure(error); }
}
async function POSTHandler(request: Request, context: Context) {
  if (!crmMemberContext.getStore() || !isSameOriginRequest(request)) return failure(new Error("FORBIDDEN"));
  const { contactId } = await context.params;
  const body = await request.json().catch(() => null);
  if (!uuid.test(contactId) || !body) return Response.json({ error: "Demande invalide." }, { status: 400 });
  try {
    if (body.action === "complete" && typeof body.scheduledFor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.scheduledFor) && typeof body.version === "string" && Number.isFinite(Date.parse(body.version))) {
      return Response.json(await completeContactFollowUp(contactId, body.scheduledFor, body.version));
    }
    if (typeof body.completionId === "string" && uuid.test(body.completionId)) {
      if (body.action === "revert") return Response.json(await revertContactFollowUp(contactId, body.completionId));
      if (body.action === "retry") return Response.json({ calendarSync: await syncCompletedFollowUp(contactId, body.completionId) });
    }
    return Response.json({ error: "Action invalide." }, { status: 400 });
  } catch (error) { return failure(error); }
}
export const GET = withCRMIdentity(GETHandler);
export const POST = withCRMIdentity(POSTHandler);
