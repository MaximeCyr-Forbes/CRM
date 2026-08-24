import { parseCustomEmailCampaignDraft } from "../../../data/custom-email-campaign-types";
import { requireApiAccess } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { createCustomEmailCampaign, listCustomEmailCampaigns } from "../../../lib/automatic-emails/custom-campaign-persistence";
import { AUTOMATIC_EMAIL_RUNNER_AVAILABLE } from "../../../lib/automatic-emails/master-lock";

export const dynamic = "force-dynamic";

function failure(error: unknown, message: string) {
  console.error("Erreur campagnes courriel personnalisées:", error instanceof Error ? error.message : "erreur inconnue");
  return Response.json({ error: message }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET() {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  try {
    return Response.json({ data: { campaigns: await listCustomEmailCampaigns(), locked: true, runnerAvailable: AUTOMATIC_EMAIL_RUNNER_AVAILABLE } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error, "Chargement des campagnes impossible.");
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const draft = parseCustomEmailCampaignDraft(await request.json().catch(() => null));
  if (!draft || draft.status === "ready") return Response.json({ error: "Créez d’abord la campagne en brouillon avant de la rendre Prête." }, { status: 400 });
  try {
    return Response.json({ data: await createCustomEmailCampaign(draft), simulationOnly: true }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error, "Création de la campagne impossible.");
  }
}
