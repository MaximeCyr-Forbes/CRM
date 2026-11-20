import { withCRMIdentity } from "../../../../lib/auth/route";
import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { getSupabaseAdmin } from "../../../../lib/supabase/server";
import { customCampaignConfigurationIssues, isCustomEmailId, parseCustomContactIds, parseCustomEmailCampaignDraft, parseCustomEmailCampaignStepDraft } from "../../../../data/custom-email-campaign-types";
import { parseManualRecipients } from "../../../../lib/automatic-emails/manual-recipients";

export const dynamic = "force-dynamic";
async function POSTHandler(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const input = await request.json().catch(() => null);
  const campaign = parseCustomEmailCampaignDraft(input?.campaign);
  const contactIds = parseCustomContactIds({ contactIds: input?.contactIds });
  const manual = parseManualRecipients(input?.manualRecipients);
  const steps = Array.isArray(input?.steps) && input.steps.length <= 100 ? input.steps.map((s: Record<string, unknown>) => {
    if (!s || !isCustomEmailId(s.id)) return null;
    const { id, ...draft } = s;
    const parsed = parseCustomEmailCampaignStepDraft(draft);
    return parsed ? { ...parsed, id } : null;
  }) : null;
  if (!input || Object.keys(input).some(k => !["id", "expectedUpdatedAt", "campaign", "contactIds", "manualRecipients", "steps"].includes(k))
    || !isCustomEmailId(input.id) || !campaign || !contactIds || !manual || !steps || steps.some((s: unknown) => !s)
    || new Set(steps.map((s: { id: string }) => s.id)).size !== steps.length
    || (input.expectedUpdatedAt !== null && (typeof input.expectedUpdatedAt !== "string" || Number.isNaN(Date.parse(input.expectedUpdatedAt))))) {
    return Response.json({ error: "Configuration ou destinataires invalides." }, { status: 400 });
  }
  if (campaign.status === "ready") {
    const issues = customCampaignConfigurationIssues(campaign, [...contactIds.map(id => ({ id })), ...manual], steps);
    if (issues.length) return Response.json({ error: issues[0] }, { status: 400 });
  }
  const { error } = await getSupabaseAdmin().rpc("save_custom_campaign_editor", {
    p_id: input.id, p_expected: input.expectedUpdatedAt, p_campaign: campaign,
    p_contacts: contactIds, p_manual: manual, p_steps: steps,
  });
  if (error) return Response.json({ error: error.code === "40001"
    ? "Cette campagne a été modifiée dans une autre fenêtre. Fermez puis rouvrez la configuration avant de réessayer."
    : "Enregistrement impossible. La sélection précédente a été conservée." }, { status: error.code === "40001" ? 409 : 400 });
  return Response.json({ data: { id: input.id } }, { headers: { "Cache-Control": "private, no-store" } });
}
export const POST = withCRMIdentity(POSTHandler);
