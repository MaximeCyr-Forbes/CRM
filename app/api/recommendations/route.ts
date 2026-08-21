import { parseRecommendationDraft } from "../../data/recommendation-types";
import { requireApiAccess } from "../../lib/crm-access";
import { isSameOriginRequest } from "../../lib/google-calendar/config";
import {
  createRecommendation,
  listRecommendations,
} from "../../lib/recommendations/persistence";

export const dynamic = "force-dynamic";

function recommendationApiError(error: unknown, publicMessage: string) {
  console.error(
    "Erreur recommandations CRM:",
    error instanceof Error ? error.message : "Erreur technique inconnue",
  );
  return Response.json(
    { error: publicMessage },
    { status: 500, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET() {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  try {
    return Response.json(
      { data: await listRecommendations() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return recommendationApiError(error, "Chargement des recommandations impossible.");
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const draft = parseRecommendationDraft(body);
  if (!draft) {
    return Response.json({ error: "Recommandation invalide." }, { status: 400 });
  }
  try {
    return Response.json({ data: await createRecommendation(draft) }, { status: 201 });
  } catch (error) {
    return recommendationApiError(error, "Envoi de la recommandation impossible.");
  }
}
