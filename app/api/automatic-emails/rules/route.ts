import { parseAutomaticEmailRuleDraft } from "../../../data/automatic-email-types";
import { requireApiAccess } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { AUTOMATIC_EMAIL_RUNNER_AVAILABLE, automaticEmailsEnabled } from "../../../lib/automatic-emails/master-lock";
import { createAutomaticEmailRule, listAutomaticEmailDeliveries, listAutomaticEmailRules } from "../../../lib/automatic-emails/persistence";

export const dynamic = "force-dynamic";

function failure(error: unknown, message: string) {
  console.error("Erreur configuration courriels automatiques:", error instanceof Error ? error.message : "erreur inconnue");
  return Response.json({ error: message }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET() {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  try {
    const [rules, deliveries] = await Promise.all([listAutomaticEmailRules(), listAutomaticEmailDeliveries()]);
    return Response.json({
      data: { rules, deliveries, locked: true, configuredMasterLock: automaticEmailsEnabled(), runnerAvailable: AUTOMATIC_EMAIL_RUNNER_AVAILABLE },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error, "Chargement des règles impossible.");
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const draft = parseAutomaticEmailRuleDraft(await request.json().catch(() => null));
  if (!draft) return Response.json({ error: "Configuration invalide ou incomplète pour le statut Prête." }, { status: 400 });
  try {
    return Response.json({ data: await createAutomaticEmailRule(draft) }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error, "Création de la règle impossible.");
  }
}
