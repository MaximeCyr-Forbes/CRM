import { isCustomEmailId, parseCustomEmailCampaignStepDraft, parseCustomStepOrder } from "../../../../../data/custom-email-campaign-types";
import { requireApiAccess } from "../../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../../lib/google-calendar/config";
import { createCustomEmailCampaignStep, getCustomEmailCampaign, listCustomEmailCampaignSteps, reorderCustomEmailCampaignSteps } from "../../../../../lib/automatic-emails/custom-campaign-persistence";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ campaignId: string }> }) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const { campaignId } = await context.params;
  if (!isCustomEmailId(campaignId)) return Response.json({ error: "Campagne invalide." }, { status: 400 });
  try { return Response.json({ data: await listCustomEmailCampaignSteps(campaignId), simulationOnly: true }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) {
    console.error("Erreur étapes campagne personnalisée:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Chargement des courriels impossible." }, { status: 502 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const { campaignId } = await context.params;
  const draft = parseCustomEmailCampaignStepDraft(await request.json().catch(() => null));
  if (!isCustomEmailId(campaignId) || !draft) return Response.json({ error: "Courriel invalide." }, { status: 400 });
  try {
    const campaign = await getCustomEmailCampaign(campaignId);
    if (!campaign) return Response.json({ error: "Campagne introuvable." }, { status: 404 });
    if (campaign.campaign.status === "ready") return Response.json({ error: "Repassez la campagne en Brouillon avant de modifier sa séquence." }, { status: 409 });
    return Response.json({ data: await createCustomEmailCampaignStep(campaignId, draft), simulationOnly: true }, { status: 201 });
  } catch (error) {
    console.error("Erreur ajout courriel campagne:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Ajout du courriel impossible." }, { status: 502 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const { campaignId } = await context.params;
  const stepIds = parseCustomStepOrder(await request.json().catch(() => null));
  if (!isCustomEmailId(campaignId) || !stepIds) return Response.json({ error: "Ordre invalide." }, { status: 400 });
  try {
    const campaign = await getCustomEmailCampaign(campaignId);
    if (!campaign) return Response.json({ error: "Campagne introuvable." }, { status: 404 });
    if (campaign.campaign.status === "ready") return Response.json({ error: "Repassez la campagne en Brouillon avant de modifier sa séquence." }, { status: 409 });
    const steps = await reorderCustomEmailCampaignSteps(campaignId, stepIds);
    return steps ? Response.json({ data: steps, simulationOnly: true }) : Response.json({ error: "Ordre incomplet ou invalide." }, { status: 400 });
  } catch (error) {
    console.error("Erreur ordre courriels campagne:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Réorganisation impossible." }, { status: 502 });
  }
}
