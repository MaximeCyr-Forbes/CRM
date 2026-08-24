import { BROKER_LABELS } from "../../data/contact-types";
import type { CalendarConnectionStatus } from "../../data/calendar-types";
import {
  customCampaignConfigurationIssues,
  invalidCustomTemplateVariables,
  type CustomEmailCampaign,
  type CustomEmailCampaignContact,
  type CustomEmailCampaignOccurrence,
  type CustomEmailCampaignStep,
} from "../../data/custom-email-campaign-types";
import { gmailStateForBroker } from "../../data/automatic-email-types";

function addDays(value: string, days: number) {
  const parsed = new Date(`${value}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function resolveCustomEmailTemplate(template: string, contact: Pick<CustomEmailCampaignContact, "firstName" | "lastName" | "email" | "phone">) {
  const values: Record<string, string> = {
    firstName: contact.firstName,
    lastName: contact.lastName,
    fullName: `${contact.firstName} ${contact.lastName}`.trim(),
    email: contact.email,
    phone: contact.phone,
  };
  return template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g, (_, name: string) => values[name] ?? "");
}

export function customCampaignDuration(steps: readonly Pick<CustomEmailCampaignStep, "delayDaysAfterPrevious">[]) {
  return steps.reduce((sum, step) => sum + step.delayDaysAfterPrevious, 0);
}

export function calculateCustomCampaignOccurrences(
  campaign: CustomEmailCampaign,
  contacts: readonly CustomEmailCampaignContact[],
  steps: readonly CustomEmailCampaignStep[],
  connections: readonly CalendarConnectionStatus[],
): CustomEmailCampaignOccurrence[] {
  if (!campaign.startDate) return [];
  const ordered = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const campaignIssues = customCampaignConfigurationIssues(campaign, contacts, ordered);
  let cumulativeDelay = 0;
  const occurrences: CustomEmailCampaignOccurrence[] = [];
  for (const step of ordered) {
    cumulativeDelay += step.delayDaysAfterPrevious;
    const scheduledDate = addDays(campaign.startDate, cumulativeDelay);
    for (const contact of contacts) {
      const broker = campaign.senderStrategy === "fixed_broker"
        ? campaign.fixedBroker
        : contact.broker === "unassigned" ? campaign.fallbackBroker : contact.broker;
      const gmail = gmailStateForBroker(connections, broker);
      const blockingReasons = [...campaignIssues];
      if (!contact.email.trim()) blockingReasons.push("Adresse courriel manquante.");
      if (!broker) blockingReasons.push("Courtier non déterminé.");
      if (broker && !gmail.connected) blockingReasons.push(`Gmail n’est pas connecté pour ${BROKER_LABELS[broker]}.`);
      if (broker && gmail.connected && !gmail.signatureReady) blockingReasons.push(`La signature Gmail n’est pas autorisée pour ${BROKER_LABELS[broker]}.`);
      if (!step.subjectTemplate.trim()) blockingReasons.push("Objet vide.");
      if (!step.bodyTemplate.trim()) blockingReasons.push("Message vide.");
      if (invalidCustomTemplateVariables(`${step.subjectTemplate}\n${step.bodyTemplate}`).length > 0) blockingReasons.push("Le modèle contient une variable inconnue.");
      occurrences.push({
        occurrenceKey: `custom:${campaign.id}:${contact.id}:${step.id}`,
        campaignId: campaign.id,
        campaignName: campaign.name,
        contactId: contact.id,
        stepId: step.id,
        stepOrder: step.stepOrder,
        recipientName: `${contact.firstName} ${contact.lastName}`.trim() || "Contact sans nom",
        recipientEmail: contact.email.trim(),
        broker,
        brokerLabel: gmail.label,
        scheduledDate,
        scheduledTime: `${campaign.sendHour.toString().padStart(2, "0")}:${campaign.sendMinute.toString().padStart(2, "0")}`,
        timezone: campaign.timezone,
        subject: resolveCustomEmailTemplate(step.subjectTemplate, contact),
        message: resolveCustomEmailTemplate(step.bodyTemplate, contact),
        gmailConnected: gmail.connected,
        gmailSignatureReady: gmail.signatureReady,
        blockingReasons: [...new Set(blockingReasons)],
      });
    }
  }
  return occurrences.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.stepOrder - b.stepOrder || a.recipientName.localeCompare(b.recipientName, "fr"));
}
