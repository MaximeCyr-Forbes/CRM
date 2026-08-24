import { isCustomEmailId, parseCustomContactIds } from "../../../../../data/custom-email-campaign-types";
import { requireApiAccess } from "../../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../../lib/google-calendar/config";
import { getCustomEmailCampaign, listCustomEmailSelectableContacts, replaceCustomEmailCampaignContacts } from "../../../../../lib/automatic-emails/custom-campaign-persistence";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ campaignId: string }> }) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const { campaignId } = await context.params;
  if (!isCustomEmailId(campaignId)) return Response.json({ error: "Campagne invalide." }, { status: 400 });
  try {
    if (!await getCustomEmailCampaign(campaignId)) return Response.json({ error: "Campagne introuvable." }, { status: 404 });
    return Response.json({ data: await listCustomEmailSelectableContacts(campaignId), simulationOnly: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Erreur destinataires campagne personnalisée:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Chargement des destinataires impossible." }, { status: 502 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const { campaignId } = await context.params;
  const contactIds = parseCustomContactIds(await request.json().catch(() => null));
  if (!isCustomEmailId(campaignId) || !contactIds) return Response.json({ error: "Sélection invalide." }, { status: 400 });
  try {
    const campaign = await getCustomEmailCampaign(campaignId);
    if (!campaign) return Response.json({ error: "Campagne introuvable." }, { status: 404 });
    if (campaign.campaign.status === "ready") return Response.json({ error: "Repassez la campagne en Brouillon avant de modifier ses destinataires." }, { status: 409 });
    return Response.json({ data: await replaceCustomEmailCampaignContacts(campaignId, contactIds), simulationOnly: true });
  } catch (error) {
    console.error("Erreur sélection destinataires campagne:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Enregistrement des destinataires impossible." }, { status: 502 });
  }
}
