import { withCRMIdentity } from '../../../../lib/auth/route';
import { isAutomaticEmailRuleId, parseAutomaticEmailRuleDraft } from "../../../../data/automatic-email-types";
import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { mutateAutomaticEmailRule, updateAutomaticEmailRule } from "../../../../lib/automatic-emails/persistence";

export const dynamic = "force-dynamic";

async function mutate(request: Request, context: { params: Promise<{ ruleId: string }> }, archive = false) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return Response.json({ error: "Format JSON requis." }, { status: 415 });
  const { ruleId } = await context.params;
  if (!isAutomaticEmailRuleId(ruleId)) return Response.json({ error: "Règle invalide." }, { status: 400 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || !Number.isSafeInteger(body.version) || body.version < 1) return Response.json({ error: "Version invalide. Actualisez la liste." }, { status: 400 });
  const { version, ...values } = body;
  const action = archive ? "archive" : values.action === "restore" ? "restore" : "update";
  const draft = action === "update" ? parseAutomaticEmailRuleDraft(values) : null;
  if ((action === "update" && !draft) || (action !== "update" && Object.keys(values).some(key => key !== "action")) || (archive && values.action !== undefined)) return Response.json({ error: "Configuration invalide ou incomplète pour le statut Prête." }, { status: 400 });
  try {
    const updated = action === "update" ? await updateAutomaticEmailRule(ruleId, draft!, version) : await mutateAutomaticEmailRule(ruleId, version, action);
    return updated
      ? Response.json({ data: updated }, { headers: { "Cache-Control": "private, no-store" } })
      : Response.json({ error: "Règle introuvable." }, { status: 404 });
  } catch (error) {
    const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
    if (/RULE_VERSION_CONFLICT|RULE_ARCHIVED|RULE_SEND_IN_PROGRESS/.test(message)) return Response.json({ error: message.includes("SEND_IN_PROGRESS") ? "Une opération est en cours. Réessayez après sa fin." : "Cette communication a changé. Actualisez la liste avant de réessayer ; votre brouillon est conservé." }, { status: 409 });
    if (/RULE_TYPE_IMMUTABLE|RULE_INVALID_INPUT/.test(message)) return Response.json({ error: "Le type de communication ne peut pas être modifié." }, { status: 400 });
    console.error("Erreur modification règle courriel automatique:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Modification de la règle impossible." }, { status: 502 });
  }
}

export const PATCH = withCRMIdentity((request: Request, context: { params: Promise<{ ruleId: string }> }) => mutate(request, context));
export const DELETE = withCRMIdentity((request: Request, context: { params: Promise<{ ruleId: string }> }) => mutate(request, context, true));
