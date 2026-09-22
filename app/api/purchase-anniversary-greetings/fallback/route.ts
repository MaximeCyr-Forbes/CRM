import { requireApiAccess, birthdayWorkspaceActor } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { purchaseRule } from "../../../lib/purchase-anniversary/service";
import { ruleConfigurationIssues } from "../../../data/automatic-email-types";
import { getSupabaseAdmin } from "../../../lib/supabase/server";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request) || !await birthdayWorkspaceActor(request)) return Response.json({ error: "Espace ou origine refusé." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") return Response.json({ error: "État invalide." }, { status: 400 });
  try {
    if (!body.enabled) {
      const { data, error: readError } = await getSupabaseAdmin().from("automatic_email_rules").select("id").eq("rule_type", "purchase_anniversary").single();
      if (readError || !data) throw readError ?? new Error("Règle absente.");
      const { error } = await getSupabaseAdmin().rpc("update_purchase_anniversary_rule", { p_id: data.id, p_values: {}, p_enabled: false });
      if (error) throw error;
      return Response.json({ enabled: false }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const rule = await purchaseRule();
    const issues = ruleConfigurationIssues(rule);
    const invalidSyntax = /\{\{|\}\}/.test(`${rule.subjectTemplate}\n${rule.bodyTemplate}`.replace(/\{\{\s*(firstName|lastName|fullName|purchaseDate)\s*\}\}/g, ""));
    if (body.enabled && (issues.length || invalidSyntax)) return Response.json({ error: issues[0] ?? "Variable du modèle invalide." }, { status: 400 });
    const { error } = await getSupabaseAdmin().rpc("update_purchase_anniversary_rule", { p_id: rule.id, p_values: {}, p_enabled: body.enabled });
    if (error) throw error;
    return Response.json({ enabled: body.enabled }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Modification du filet de sécurité impossible." }, { status: 502 }); }
}
