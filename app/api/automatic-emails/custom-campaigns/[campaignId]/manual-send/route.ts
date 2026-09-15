import { isCustomEmailId } from "../../../../../data/custom-email-campaign-types";
import { requireApiAccess } from "../../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../../lib/google-calendar/config";
import { manualHistory } from "../../../../../lib/automatic-emails/custom-manual-persistence";
import { prepareManualCampaign, sendManualCampaign, type ManualSendRequest } from "../../../../../lib/automatic-emails/custom-manual-service";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ campaignId: string }> };

export async function GET(request: Request, context: Context) {
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

export async function POST(request: Request, context: Context) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const { campaignId } = await context.params;
  const input = await request.json().catch(() => null) as ManualSendRequest | null;
  if (!isCustomEmailId(campaignId) || !input || input.confirmation !== "ENVOYER" || !isCustomEmailId(input.stepId)
    || !isCustomEmailId(input.batchId) || !isCustomEmailId(input.attemptKey) || typeof input.retry !== "boolean"
    || !Array.isArray(input.contactIds) || input.contactIds.length < 1 || input.contactIds.length > 3
    || input.contactIds.some((id) => !isCustomEmailId(id)) || new Set(input.contactIds).size !== input.contactIds.length
    || !input.fingerprints || input.contactIds.some((id) => typeof input.fingerprints[id] !== "string" || !/^[a-f0-9]{64}$/.test(input.fingerprints[id]))) {
    return Response.json({ error: "Confirmation explicite et sélection valide requises." }, { status: 400 });
  }
  try { return Response.json({ data: await sendManualCampaign(campaignId, input) }, { headers }); }
  catch (error) {
    return Response.json({ error: error instanceof TypeError ? error.message : "Envoi interrompu. Consultez l’historique avant toute nouvelle tentative." }, { status: error instanceof TypeError ? 409 : 502, headers });
  }
}
