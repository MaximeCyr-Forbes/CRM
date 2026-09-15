import { createHash } from "node:crypto";
import type { CalendarBroker } from "../../data/calendar-types";
import type { ManualPreview, ManualRecipient } from "../../data/custom-email-manual-types";
import { getCustomEmailCampaign } from "./custom-campaign-persistence";
import { manualSenderBroker, renderManualRecipient } from "./custom-manual-render";
import { claimManualRecipient, ensureManualBatch, finishManualRecipient, manualHistory } from "./custom-manual-persistence";
import { GmailAuthorizationRequiredError, GmailSendError, gmailMessageHtml, prepareGmailSender, sendPreparedGmailMessage } from "../google-gmail/service";

export async function prepareManualCampaign(campaignId: string, stepId: string) {
  const bundle = await getCustomEmailCampaign(campaignId);
  const step = bundle?.steps.find((item) => item.id === stepId);
  if (!bundle || !step) throw new TypeError("Campagne ou étape introuvable.");
  const history = await manualHistory(campaignId);
  const senders = new Map<CalendarBroker, Awaited<ReturnType<typeof prepareGmailSender>>>();
  const errors = new Map<CalendarBroker, string>();
  const brokers = new Set(bundle.contacts.map((contact) => manualSenderBroker(bundle.campaign, contact)));
  await Promise.all([...brokers].map(async (broker) => {
    if (!broker) return;
    try { senders.set(broker, await prepareGmailSender(broker)); }
    catch (error) { errors.set(broker, error instanceof Error ? error.message : "Connexion Gmail indisponible."); }
  }));
  const recipients: ManualRecipient[] = bundle.contacts.map((contact) => {
    const rendered = renderManualRecipient(step, contact);
    const broker = manualSenderBroker(bundle.campaign, contact);
    const sender = broker ? senders.get(broker) : undefined;
    const blockingReasons = [...rendered.blockingReasons];
    if (!broker) blockingReasons.push("Courtier non déterminé.");
    else if (!sender) blockingReasons.push(errors.get(broker) ?? "Gmail non connecté.");
    const html = sender ? gmailMessageHtml(rendered.message, sender.identity) : "";
    const fingerprint = createHash("sha256").update(JSON.stringify({ campaignId, stepId,
      strategy: bundle.campaign.senderStrategy, broker, contact, subject: rendered.subject, message: rendered.message,
      html, identity: sender?.identity ?? null })).digest("hex");
    return { ...rendered, contactId: contact.id, name: `${(contact.firstName ?? "").trim()} ${(contact.lastName ?? "").trim()}`.trim(),
      broker, senderEmail: sender?.identity.sendAsEmail ?? "", senderName: sender?.identity.displayName ?? "",
      html, fingerprint, blockingReasons, deliveryStatus: history.find((row) => row.step_id === stepId && row.contact_id === contact.id)?.status ?? null };
  });
  const preview: ManualPreview = { campaignId, campaignName: bundle.campaign.name, stepId, stepOrder: step.stepOrder, recipients };
  return { preview, senders };
}

export type ManualSendRequest = {
  confirmation: "ENVOYER";
  batchId: string;
  attemptKey: string;
  stepId: string;
  contactIds: string[];
  fingerprints: Record<string, string>;
  retry: boolean;
};

// Each explicit browser action submits small chunks. There is no timer, runner,
// background continuation or retry; an interrupted browser stops further chunks.
export async function sendManualCampaign(campaignId: string, input: ManualSendRequest) {
  const { preview, senders } = await prepareManualCampaign(campaignId, input.stepId);
  const recipients = input.contactIds.map((id) => {
    const recipient = preview.recipients.find((item) => item.contactId === id);
    if (!recipient) throw new TypeError("Un Contact a été supprimé ou retiré de cette campagne. Actualisez l’aperçu.");
    if (recipient.fingerprint !== input.fingerprints[id]) throw new TypeError("Le Contact, le modèle ou la signature a changé. Actualisez l’aperçu avant de confirmer.");
    return recipient;
  });
  await ensureManualBatch(input.batchId, preview);
  for (const recipient of recipients) {
    const id = await claimManualRecipient(input.batchId, input.attemptKey, preview, recipient, input.retry);
    if (!id || recipient.blockingReasons.length) continue;
    const sender = recipient.broker ? senders.get(recipient.broker) : undefined;
    if (!sender) throw new Error("Expéditeur préparé indisponible.");
    try {
      const sent = await sendPreparedGmailMessage(sender, { to: recipient.to, subject: recipient.subject, message: recipient.message });
      await finishManualRecipient(id, input.attemptKey, "sent", sent.id, null);
    } catch (error) {
      // Only a definitive Gmail rejection is eligible for a future manual retry.
      // Transport errors and database failures after Gmail remain pending.
      const definitive = error instanceof GmailAuthorizationRequiredError || error instanceof GmailSendError;
      await finishManualRecipient(id, input.attemptKey, definitive ? "failed" : "pending", null,
        error instanceof Error ? error.message : "Résultat Gmail à vérifier.");
    }
  }
  return manualHistory(campaignId);
}
