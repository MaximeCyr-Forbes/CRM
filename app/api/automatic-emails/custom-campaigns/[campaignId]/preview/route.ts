import { isCustomEmailId } from "../../../../../data/custom-email-campaign-types";
import { requireApiAccess } from "../../../../../lib/crm-access";
import { getCustomEmailCampaignPreview } from "../../../../../lib/automatic-emails/custom-campaign-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ campaignId: string }> }) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const { campaignId } = await context.params;
  if (!isCustomEmailId(campaignId)) return Response.json({ error: "Campagne invalide." }, { status: 400 });
  try {
    const preview = await getCustomEmailCampaignPreview(campaignId);
    return preview
      ? Response.json({ data: preview, simulationOnly: true }, { headers: { "Cache-Control": "private, no-store" } })
      : Response.json({ error: "Campagne introuvable." }, { status: 404 });
  } catch (error) {
    console.error("Erreur prévisualisation campagne personnalisée:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Prévisualisation temporairement indisponible." }, { status: 502 });
  }
}
