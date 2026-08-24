import { customCampaignConfigurationIssues, isCustomEmailId, parseCustomEmailCampaignDraft } from "../../../../data/custom-email-campaign-types";
import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { deleteCustomEmailCampaign, getCustomEmailCampaign, updateCustomEmailCampaign } from "../../../../lib/automatic-emails/custom-campaign-persistence";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ campaignId: string }> }) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const { campaignId } = await context.params;
  if (!isCustomEmailId(campaignId)) return Response.json({ error: "Campagne invalide." }, { status: 400 });
  try {
    const bundle = await getCustomEmailCampaign(campaignId);
    return bundle ? Response.json({ data: bundle, simulationOnly: true }, { headers: { "Cache-Control": "private, no-store" } }) : Response.json({ error: "Campagne introuvable." }, { status: 404 });
  } catch (error) {
    console.error("Erreur lecture campagne personnalisée:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Chargement de la campagne impossible." }, { status: 502 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const { campaignId } = await context.params;
  const draft = parseCustomEmailCampaignDraft(await request.json().catch(() => null));
  if (!isCustomEmailId(campaignId) || !draft) return Response.json({ error: "Configuration invalide." }, { status: 400 });
  try {
    const current = await getCustomEmailCampaign(campaignId);
    if (!current) return Response.json({ error: "Campagne introuvable." }, { status: 404 });
    if (draft.status === "ready") {
      const issues = customCampaignConfigurationIssues(draft, current.contacts, current.steps);
      if (issues.length > 0) return Response.json({ error: issues[0], issues }, { status: 400 });
    }
    return Response.json({ data: await updateCustomEmailCampaign(campaignId, draft), simulationOnly: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Erreur modification campagne personnalisée:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Modification de la campagne impossible." }, { status: 502 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const { campaignId } = await context.params;
  if (!isCustomEmailId(campaignId)) return Response.json({ error: "Campagne invalide." }, { status: 400 });
  try {
    return await deleteCustomEmailCampaign(campaignId)
      ? Response.json({ data: { deleted: true }, simulationOnly: true })
      : Response.json({ error: "Seule une campagne Brouillon ou En pause peut être supprimée." }, { status: 409 });
  } catch (error) {
    console.error("Erreur suppression campagne personnalisée:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Suppression de la campagne impossible." }, { status: 502 });
  }
}
