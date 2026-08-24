import type { CalendarBroker } from "./calendar-types";
import { CONTACT_BROKERS, type ContactBroker } from "./contact-types";

export const CUSTOM_EMAIL_CAMPAIGN_STATUSES = ["draft", "ready", "paused"] as const;
export const CUSTOM_EMAIL_EXECUTION_MODES = ["approval", "automatic"] as const;
export const CUSTOM_EMAIL_SENDER_STRATEGIES = ["assigned_broker", "fixed_broker"] as const;
export const CUSTOM_EMAIL_VARIABLES = ["firstName", "lastName", "fullName", "email", "phone"] as const;

export type CustomEmailCampaignStatus = (typeof CUSTOM_EMAIL_CAMPAIGN_STATUSES)[number];
export type CustomEmailExecutionMode = (typeof CUSTOM_EMAIL_EXECUTION_MODES)[number];
export type CustomEmailSenderStrategy = (typeof CUSTOM_EMAIL_SENDER_STRATEGIES)[number];

export type CustomEmailCampaign = {
  id: string;
  name: string;
  status: CustomEmailCampaignStatus;
  executionMode: CustomEmailExecutionMode;
  senderStrategy: CustomEmailSenderStrategy;
  fixedBroker: CalendarBroker | null;
  fallbackBroker: CalendarBroker | null;
  startDate: string | null;
  sendHour: number;
  sendMinute: number;
  timezone: "America/Toronto";
  contactCount: number;
  stepCount: number;
  durationDays: number;
  createdAt: string;
  updatedAt: string;
};

export type CustomEmailCampaignDraft = Pick<CustomEmailCampaign,
  "name" | "status" | "executionMode" | "senderStrategy" | "fixedBroker" | "fallbackBroker" | "startDate" | "sendHour" | "sendMinute" | "timezone"
>;

export type CustomEmailCampaignStep = {
  id: string;
  campaignId: string;
  stepOrder: number;
  delayDaysAfterPrevious: number;
  subjectTemplate: string;
  bodyTemplate: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomEmailCampaignStepDraft = Pick<CustomEmailCampaignStep,
  "delayDaysAfterPrevious" | "subjectTemplate" | "bodyTemplate"
>;

export type CustomEmailCampaignContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  broker: ContactBroker;
  selected: boolean;
};

export type CustomEmailCampaignOccurrence = {
  occurrenceKey: string;
  campaignId: string;
  campaignName: string;
  contactId: string;
  stepId: string;
  stepOrder: number;
  recipientName: string;
  recipientEmail: string;
  broker: CalendarBroker | null;
  brokerLabel: string;
  scheduledDate: string;
  scheduledTime: string;
  timezone: "America/Toronto";
  subject: string;
  message: string;
  gmailConnected: boolean;
  gmailSignatureReady: boolean;
  blockingReasons: string[];
};

export type CustomEmailCampaignPreview = {
  campaign: CustomEmailCampaign;
  contacts: CustomEmailCampaignContact[];
  steps: CustomEmailCampaignStep[];
  occurrences: CustomEmailCampaignOccurrence[];
  summary: { total: number; ready: number; blocked: number; contacts: number; steps: number };
  simulationOnly: true;
};

export const CUSTOM_EMAIL_CAMPAIGN_STATUS_LABELS: Record<CustomEmailCampaignStatus, string> = {
  draft: "Brouillon",
  ready: "Prête",
  paused: "En pause",
};

export const CUSTOM_EMAIL_SENDER_LABELS: Record<CustomEmailSenderStrategy, string> = {
  assigned_broker: "Selon le courtier attribué",
  fixed_broker: "Courtier fixe",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isCustomEmailId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function brokerOrNull(value: unknown): CalendarBroker | null | undefined {
  if (value === null) return null;
  return CONTACT_BROKERS.includes(value as CalendarBroker) ? value as CalendarBroker : undefined;
}

export function customTemplateVariables(template: string) {
  return [...template.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g)].map((match) => match[1]);
}

export function invalidCustomTemplateVariables(template: string) {
  const allowed = new Set<string>(CUSTOM_EMAIL_VARIABLES);
  return [...new Set(customTemplateVariables(template).filter((name) => !allowed.has(name)))];
}

export function parseCustomEmailCampaignDraft(value: unknown): CustomEmailCampaignDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const allowed = new Set(["name", "status", "executionMode", "senderStrategy", "fixedBroker", "fallbackBroker", "startDate", "sendHour", "sendMinute", "timezone"]);
  const fixedBroker = brokerOrNull(data.fixedBroker);
  const fallbackBroker = brokerOrNull(data.fallbackBroker);
  if (Object.keys(data).some((key) => !allowed.has(key))
    || typeof data.name !== "string" || data.name.trim().length < 1 || data.name.trim().length > 160
    || !CUSTOM_EMAIL_CAMPAIGN_STATUSES.includes(data.status as CustomEmailCampaignStatus)
    || !CUSTOM_EMAIL_EXECUTION_MODES.includes(data.executionMode as CustomEmailExecutionMode)
    || !CUSTOM_EMAIL_SENDER_STRATEGIES.includes(data.senderStrategy as CustomEmailSenderStrategy)
    || fixedBroker === undefined || fallbackBroker === undefined
    || (data.startDate !== null && (typeof data.startDate !== "string" || !validDate(data.startDate)))
    || !Number.isInteger(data.sendHour) || Number(data.sendHour) < 0 || Number(data.sendHour) > 23
    || !Number.isInteger(data.sendMinute) || Number(data.sendMinute) < 0 || Number(data.sendMinute) > 59
    || data.timezone !== "America/Toronto") return null;
  return {
    name: data.name.trim(),
    status: data.status as CustomEmailCampaignStatus,
    executionMode: data.executionMode as CustomEmailExecutionMode,
    senderStrategy: data.senderStrategy as CustomEmailSenderStrategy,
    fixedBroker,
    fallbackBroker,
    startDate: data.startDate as string | null,
    sendHour: Number(data.sendHour),
    sendMinute: Number(data.sendMinute),
    timezone: "America/Toronto",
  };
}

export function parseCustomEmailCampaignStepDraft(value: unknown): CustomEmailCampaignStepDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const allowed = new Set(["delayDaysAfterPrevious", "subjectTemplate", "bodyTemplate"]);
  if (Object.keys(data).some((key) => !allowed.has(key))
    || !Number.isInteger(data.delayDaysAfterPrevious) || Number(data.delayDaysAfterPrevious) < 0 || Number(data.delayDaysAfterPrevious) > 3650
    || typeof data.subjectTemplate !== "string" || data.subjectTemplate.length > 250
    || typeof data.bodyTemplate !== "string" || data.bodyTemplate.length > 100_000) return null;
  return {
    delayDaysAfterPrevious: Number(data.delayDaysAfterPrevious),
    subjectTemplate: data.subjectTemplate.trim(),
    bodyTemplate: data.bodyTemplate.trim(),
  };
}

export function parseCustomContactIds(value: unknown): string[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => key !== "contactIds") || !Array.isArray(data.contactIds) || data.contactIds.length > 10_000) return null;
  if (data.contactIds.some((id) => !isCustomEmailId(id)) || new Set(data.contactIds).size !== data.contactIds.length) return null;
  return data.contactIds as string[];
}

export function parseCustomStepOrder(value: unknown): string[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => key !== "stepIds") || !Array.isArray(data.stepIds) || data.stepIds.length > 100) return null;
  if (data.stepIds.some((id) => !isCustomEmailId(id)) || new Set(data.stepIds).size !== data.stepIds.length) return null;
  return data.stepIds as string[];
}

export function customCampaignConfigurationIssues(
  campaign: Pick<CustomEmailCampaignDraft, "name" | "senderStrategy" | "fixedBroker" | "fallbackBroker" | "startDate" | "sendHour" | "sendMinute">,
  contacts: readonly Pick<CustomEmailCampaignContact, "id">[],
  steps: readonly Pick<CustomEmailCampaignStep, "delayDaysAfterPrevious" | "subjectTemplate" | "bodyTemplate">[],
) {
  const issues: string[] = [];
  if (!campaign.name.trim()) issues.push("Ajoutez un nom de campagne.");
  if (!campaign.startDate || !validDate(campaign.startDate)) issues.push("Choisissez une date de début valide.");
  if (!Number.isInteger(campaign.sendHour) || campaign.sendHour < 0 || campaign.sendHour > 23 || !Number.isInteger(campaign.sendMinute) || campaign.sendMinute < 0 || campaign.sendMinute > 59) issues.push("Choisissez une heure valide.");
  if (contacts.length === 0) issues.push("Sélectionnez au moins un Contact.");
  if (steps.length === 0) issues.push("Ajoutez au moins un courriel.");
  steps.forEach((step, index) => {
    if (index === 0 && step.delayDaysAfterPrevious !== 0) issues.push("Le premier courriel doit être prévu au Jour 0.");
    if (!step.subjectTemplate.trim()) issues.push(`Ajoutez l’objet du courriel ${index + 1}.`);
    if (!step.bodyTemplate.trim()) issues.push(`Ajoutez le message du courriel ${index + 1}.`);
    const invalid = invalidCustomTemplateVariables(`${step.subjectTemplate}\n${step.bodyTemplate}`);
    if (invalid.length > 0) issues.push(`Variable inconnue dans le courriel ${index + 1} : {{${invalid[0]}}}.`);
  });
  if (campaign.senderStrategy === "assigned_broker" && !campaign.fallbackBroker) issues.push("Choisissez le courtier de secours des Contacts non attribués.");
  if (campaign.senderStrategy === "fixed_broker" && !campaign.fixedBroker) issues.push("Choisissez le courtier fixe.");
  return [...new Set(issues)];
}
