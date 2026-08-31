import { isRecommendationId } from "../../../data/recommendation-types";
import { requireApiAccess } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import {
  deleteRecommendation,
  markRecommendationCompleted,
  markRecommendationPending,
  markRecommendationRead,
} from "../../../lib/recommendations/persistence";

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

  let action: "read" | "complete" | "reopen" = "read";
  const requestBody = await request.text();
  if (requestBody.trim()) {
    try {
      const parsed = JSON.parse(requestBody) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      const data = parsed as Record<string, unknown>;
      if (
        Object.keys(data).some((field) => field !== "action")
        || (data.action !== "read" && data.action !== "complete" && data.action !== "reopen")
      ) throw new Error();
      action = data.action;
    } catch {
      return Response.json({ error: "Action de recommandation invalide." }, { status: 400 });
    }
  }

  try {
    const recommendation = action === "complete"
      ? await markRecommendationCompleted(recommendationId)
      : action === "reopen"
        ? await markRecommendationPending(recommendationId)
        : await markRecommendationRead(recommendationId);
    if (!recommendation) {
      return Response.json({ error: "Recommandation introuvable." }, { status: 404 });
    }
    return Response.json(
      { data: recommendation },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error(
      action === "complete" || action === "reopen"
        ? "Erreur traitement recommandation CRM:"
        : "Erreur ouverture recommandation CRM:",
      error instanceof Error ? error.message : "Erreur technique inconnue",
    );
    return Response.json(
      {
        error: action === "complete" || action === "reopen"
          ? "Traitement de la recommandation impossible."
          : "Ouverture de la recommandation impossible.",
      },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export async function DELETE(request: Request, context: RecommendationRouteContext) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) {
    return Response.json(
      { error: "Origine refusée." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const { recommendationId } = await context.params;
  if (!isRecommendationId(recommendationId)) {
    return Response.json(
      { error: "Recommandation invalide." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    if (!await deleteRecommendation(recommendationId)) {
      return Response.json(
        { error: "Recommandation introuvable." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return Response.json(
      { data: { recommendationId } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error(
      "Erreur suppression recommandation CRM:",
      error instanceof Error ? error.message : "Erreur technique inconnue",
    );
    return Response.json(
      { error: "Suppression de la recommandation impossible." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
