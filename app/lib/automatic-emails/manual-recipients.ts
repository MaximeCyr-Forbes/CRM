import type { CustomEmailCampaignContact } from "../../data/custom-email-campaign-types";
import { isCustomEmailId } from "../../data/custom-email-campaign-types";
import { CONTACT_BROKERS } from "../../data/contact-types";
import { validateGmailMessage } from "../email/validation";

export type CampaignManualRecipient = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  broker: "maxime" | "france" | "sandrine" | null;
};

// Deduplication only: preserve the submitted mailbox; do not remove dots or +tags.
export const normalizedCampaignEmail = (email: string) => email.trim().toLowerCase();
export function validCampaignEmail(email: string) {
  try { validateGmailMessage({ to: email, subject: "Validation", message: "Validation" }); return true; }
  catch { return false; }
}

export function parseCampaignEmails(text: string, existing: readonly string[] = []) {
  const seen = new Set(existing.map(normalizedCampaignEmail));
  const accepted: string[] = [], invalid: string[] = [];
  let duplicates = 0;
  for (const email of text.split(/[,;\r\n]+/).map(value => value.trim()).filter(Boolean)) {
    if (!validCampaignEmail(email)) { invalid.push(email); continue; }
    const key = normalizedCampaignEmail(email);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key); accepted.push(email);
  }
  return { accepted, invalid, duplicates };
}

// The textarea is the complete desired list. Match by mailbox, never by line
// position: reordering/deleting lines must not transfer another person's metadata.
export function reconcileManualRecipientText(text: string, existing: readonly CampaignManualRecipient[], createId: () => string) {
  const parsed = parseCampaignEmails(text);
  const byEmail = new Map(existing.map(r => [normalizedCampaignEmail(r.email), r]));
  const recipients = parsed.accepted.map(email => {
    const previous = byEmail.get(normalizedCampaignEmail(email));
    return previous ? { ...previous, email } : { id: createId(), email, firstName: "", lastName: "", broker: null };
  });
  return { ...parsed, recipients };
}

export function parseManualRecipients(value: unknown): CampaignManualRecipient[] | null {
  if (!Array.isArray(value) || value.length > 10000) return null;
  const result: CampaignManualRecipient[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Object.keys(entry).some(key => !["id", "email", "firstName", "lastName", "broker"].includes(key))
      || !isCustomEmailId(entry.id) || typeof entry.email !== "string" || !validCampaignEmail(entry.email)
      || typeof entry.firstName !== "string" || entry.firstName.length > 120
      || typeof entry.lastName !== "string" || entry.lastName.length > 120
      || (entry.broker !== null && !CONTACT_BROKERS.includes(entry.broker))) return null;
    result.push({ id: entry.id, email: entry.email.trim(), firstName: entry.firstName.trim(), lastName: entry.lastName.trim(), broker: entry.broker });
  }
  if (new Set(result.map(r => r.id)).size !== result.length || new Set(result.map(r => normalizedCampaignEmail(r.email))).size !== result.length) return null;
  return result;
}

export type CampaignRecipient = CustomEmailCampaignContact & { manualRecipientId?: string };
export const campaignRecipientKey = (recipient: CampaignRecipient) => recipient.manualRecipientId ? `manual:${recipient.id}` : recipient.id;
export function effectiveCampaignRecipients(contacts: readonly CustomEmailCampaignContact[], manual: readonly CampaignManualRecipient[] = []): CampaignRecipient[] {
  const seen = new Set<string>();
  const all: CampaignRecipient[] = [...contacts, ...manual.map(r => ({ ...r, manualRecipientId: r.id, broker: r.broker ?? "unassigned" as const, phone: "", selected: true }))];
  return all.filter(r => {
    const key = normalizedCampaignEmail(r.email);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
