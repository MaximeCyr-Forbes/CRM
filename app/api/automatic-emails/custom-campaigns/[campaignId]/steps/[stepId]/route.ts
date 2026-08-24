import { isCustomEmailId, parseCustomEmailCampaignStepDraft } from "../../../../../../data/custom-email-campaign-types";
import { requireApiAccess } from "../../../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../../../lib/google-calendar/config";
import { deleteCustomEmailCampaignStep, getCustomEmailCampaign, updateCustomEmailCampaignStep } from "../../../../../../lib/automatic-emails/custom-campaign-persistence";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ campaignId: string; stepId: string }> }) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const { campaignId, stepId } = await context.params;
  const draft = parseCustomEmailCampaignStepDraft(await request.json().catch(() => null));
  if (!isCustomEmailId(campaignId) || !isCustomEmailId(stepId) || !draft) return Response.json({ error: "Courriel invalide." }, { status: 400 });
  try {
    const campaign = await getCustomEmailCampaign(campaignId);
    if (!campaign) return Response.json({ error: "Campagne introuvable." }, { status: 404 });
    if (campaign.campaign.status === "ready") return Response.json({ error: "Repassez la campagne en Brouillon avant de modifier sa séquence." }, { status: 409 });
    const step = await updateCustomEmailCampaignStep(campaignId, stepId, draft);
    return step ? Response.json({ data: step, simulationOnly: true }) : Response.json({ error: "Courriel introuvable." }, { status: 404 });
  } catch (error) {
    console.error("Erreur modification courriel campagne:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Modification du courriel impossible." }, { status: 502 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ campaignId: string; stepId: string }> }) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const { campaignId, stepId } = await context.params;
  if (!isCustomEmailId(campaignId) || !isCustomEmailId(stepId)) return Response.json({ error: "Courriel invalide." }, { status: 400 });
  try {
    const campaign = await getCustomEmailCampaign(campaignId);
    if (!campaign) return Response.json({ error: "Campagne introuvable." }, { status: 404 });
    if (campaign.campaign.status === "ready") return Response.json({ error: "Repassez la campagne en Brouillon avant de modifier sa séquence." }, { status: 409 });
    return await deleteCustomEmailCampaignStep(campaignId, stepId)
      ? Response.json({ data: { deleted: true }, simulationOnly: true })
      : Response.json({ error: "Courriel introuvable." }, { status: 404 });
  } catch (error) {
    console.error("Erreur suppression courriel campagne:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Suppression du courriel impossible." }, { status: 502 });
  }
}
