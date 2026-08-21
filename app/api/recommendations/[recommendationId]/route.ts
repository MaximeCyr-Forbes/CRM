import { isRecommendationId } from "../../../data/recommendation-types";
import { requireApiAccess } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { markRecommendationRead } from "../../../lib/recommendations/persistence";

export const dynamic = "force-dynamic";

type RecommendationRouteContext = {
  params: Promise<{ recommendationId: string }>;
};

export async function PATCH(request: Request, context: RecommendationRouteContext) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }
  const { recommendationId } = await context.params;
  if (!isRecommendationId(recommendationId)) {
    return Response.json({ error: "Recommandation invalide." }, { status: 400 });
  }

  try {
    const recommendation = await markRecommendationRead(recommendationId);
    if (!recommendation) {
      return Response.json({ error: "Recommandation introuvable." }, { status: 404 });
    }
    return Response.json(
      { data: recommendation },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error(
      "Erreur ouverture recommandation CRM:",
      error instanceof Error ? error.message : "Erreur technique inconnue",
    );
    return Response.json(
      { error: "Ouverture de la recommandation impossible." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
