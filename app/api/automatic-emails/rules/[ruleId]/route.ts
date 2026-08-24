import { isAutomaticEmailRuleId, parseAutomaticEmailRuleDraft } from "../../../../data/automatic-email-types";
import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { updateAutomaticEmailRule } from "../../../../lib/automatic-emails/persistence";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ ruleId: string }> }) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const { ruleId } = await context.params;
  if (!isAutomaticEmailRuleId(ruleId)) return Response.json({ error: "Règle invalide." }, { status: 400 });
  const draft = parseAutomaticEmailRuleDraft(await request.json().catch(() => null));
  if (!draft) return Response.json({ error: "Configuration invalide ou incomplète pour le statut Prête." }, { status: 400 });
  try {
    const updated = await updateAutomaticEmailRule(ruleId, draft);
    return updated
      ? Response.json({ data: updated }, { headers: { "Cache-Control": "private, no-store" } })
      : Response.json({ error: "Règle introuvable." }, { status: 404 });
  } catch (error) {
    console.error("Erreur modification règle courriel automatique:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Modification de la règle impossible." }, { status: 502 });
  }
}
