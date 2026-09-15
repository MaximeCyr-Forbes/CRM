import type { ManualHistory, ManualPreview, ManualRecipient } from "../../data/custom-email-manual-types";
import { getSupabaseAdmin } from "../supabase/server";

export async function manualHistory(campaignId: string): Promise<ManualHistory[]> {
  const rows: ManualHistory[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await getSupabaseAdmin().from("custom_email_manual_deliveries")
      .select("id,batch_id,campaign_id,step_id,contact_id,broker,recipient_email,status,gmail_message_id,error,created_at,updated_at")
      .eq("campaign_id", campaignId).order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data as ManualHistory[]);
    if (data.length < 1000) return rows;
  }
}

export async function ensureManualBatch(id: string, preview: ManualPreview) {
  const db = getSupabaseAdmin();
  const inserted = await db.from("custom_email_manual_batches").upsert({ id, campaign_id: preview.campaignId,
    step_id: preview.stepId, campaign_name: preview.campaignName, step_order: preview.stepOrder, trigger: "manual" },
  { onConflict: "id", ignoreDuplicates: true });
  if (inserted.error) throw inserted.error;
  const { data, error } = await db.from("custom_email_manual_batches").select("campaign_id,step_id").eq("id", id).single();
  if (error) throw error;
  if (data.campaign_id !== preview.campaignId || data.step_id !== preview.stepId) throw new TypeError("Lot incompatible.");
}

// The unique step/contact key survives new browser sessions and new batch IDs.
// Pending rows are never reclaimed: a lost Gmail response may already be sent.
export async function claimManualRecipient(batchId: string, attemptKey: string, preview: ManualPreview, recipient: ManualRecipient, retry: boolean) {
  const db = getSupabaseAdmin();
  const row = { batch_id: batchId, campaign_id: preview.campaignId, step_id: preview.stepId,
    contact_id: recipient.contactId, broker: recipient.broker, recipient_email: recipient.to,
    status: recipient.blockingReasons.length ? "blocked" : "pending", attempt_key: attemptKey,
    error: recipient.blockingReasons.join(" ") || "Envoi en cours ou résultat Gmail à vérifier.", updated_at: new Date().toISOString() };
  if (retry) {
    const { data, error } = await db.from("custom_email_manual_deliveries").update(row)
      .eq("step_id", preview.stepId).eq("contact_id", recipient.contactId).eq("status", "failed")
      .neq("attempt_key", attemptKey).select("id").maybeSingle();
    if (error) throw error;
    return data?.id as string | undefined;
  }
  const { data, error } = await db.from("custom_email_manual_deliveries").upsert(row,
    { onConflict: "step_id,contact_id", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw error;
  return data?.id as string | undefined;
}

export async function finishManualRecipient(id: string, attemptKey: string, status: "sent" | "failed" | "pending", gmailId: string | null, message: string | null) {
  const { error } = await getSupabaseAdmin().from("custom_email_manual_deliveries")
    .update({ status, gmail_message_id: gmailId, error: message, updated_at: new Date().toISOString() })
    .eq("id", id).eq("attempt_key", attemptKey).eq("status", "pending");
  if (error) throw error;
}
