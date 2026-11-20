import { withCRMIdentity } from '../../../../../lib/auth/route';
import { isCustomEmailId } from "../../../../../data/custom-email-campaign-types";
import { requireApiAccess } from "../../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../../lib/google-calendar/config";
import { manualHistory } from "../../../../../lib/automatic-emails/custom-manual-persistence";
import { prepareManualCampaign, sendManualCampaign, type ManualSendRequest } from "../../../../../lib/automatic-emails/custom-manual-service";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ campaignId: string }> };

async function GETHandler(request: Request, context: Context) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const { campaignId } = await context.params;
  const stepId = new URL(request.url).searchParams.get("stepId");
  if (!isCustomEmailId(campaignId) || (stepId && !isCustomEmailId(stepId))) return Response.json({ error: "Identifiant invalide." }, { status: 400 });
  try {
    return Response.json({ data: stepId ? (await prepareManualCampaign(campaignId, stepId)).preview : await manualHistory(campaignId) }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof TypeError ? error.message : "Préparation des envois manuels indisponible." }, { status: 502, headers });
  }
}

async function POSTHandler(request: Request, context: Context) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const { campaignId } = await context.params;
  const input = await request.json().catch(() => null) as ManualSendRequest | null;
  const ids = input?.recipientIds ?? input?.contactIds;
  if (!isCustomEmailId(campaignId) || !input || input.confirmation !== "ENVOYER" || !isCustomEmailId(input.stepId)
    || !isCustomEmailId(input.batchId) || !isCustomEmailId(input.attemptKey) || typeof input.retry !== "boolean"
    || (input.recipientIds !== undefined && input.contactIds !== undefined)
    || !Array.isArray(ids) || ids.length < 1 || ids.length > 3
    || ids.some((id) => !(input.recipientIds && typeof id === "string" && id.startsWith("manual:") ? isCustomEmailId(id.slice(7)) : isCustomEmailId(id))) || new Set(ids).size !== ids.length
    || !input.fingerprints || ids.some((id) => typeof input.fingerprints[id] !== "string" || !/^[a-f0-9]{64}$/.test(input.fingerprints[id]))) {
    return Response.json({ error: "Confirmation explicite et sélection valide requises." }, { status: 400 });
  }
  try { return Response.json({ data: await sendManualCampaign(campaignId, input) }, { headers }); }
  catch (error) {
    return Response.json({ error: error instanceof TypeError ? error.message : "Envoi interrompu. Consultez l’historique avant toute nouvelle tentative." }, { status: error instanceof TypeError ? 409 : 502, headers });
  }
}

export const GET = withCRMIdentity(GETHandler);
export const POST = withCRMIdentity(POSTHandler);
