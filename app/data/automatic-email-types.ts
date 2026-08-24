import { BROKER_LABELS, CONTACT_BROKERS } from "./contact-types";
import type { CalendarBroker, CalendarConnectionStatus } from "./calendar-types";

export const AUTOMATIC_EMAIL_RULE_TYPES = ["birthday", "mortgage_renewal", "purchase_anniversary", "google_review"] as const;
export const AUTOMATIC_EMAIL_RULE_STATUSES = ["draft", "ready", "paused"] as const;
export const AUTOMATIC_EMAIL_EXECUTION_MODES = ["automatic", "approval"] as const;
export const AUTOMATIC_EMAIL_DELIVERY_STATUSES = ["preview", "queued", "cancelled"] as const;

export type AutomaticEmailRuleType = (typeof AUTOMATIC_EMAIL_RULE_TYPES)[number];
export type AutomaticEmailRuleStatus = (typeof AUTOMATIC_EMAIL_RULE_STATUSES)[number];
export type AutomaticEmailExecutionMode = (typeof AUTOMATIC_EMAIL_EXECUTION_MODES)[number];
export type AutomaticEmailDeliveryStatus = (typeof AUTOMATIC_EMAIL_DELIVERY_STATUSES)[number];
export type AutomaticEmailTriggerConfig = {
  leadMonths?: number;
  delayDays?: number;
  googleReviewUrl?: string;
};

export type AutomaticEmailRule = {
  id: string;
  ruleType: AutomaticEmailRuleType;
  name: string;
  status: AutomaticEmailRuleStatus;
  executionMode: AutomaticEmailExecutionMode;
  defaultBroker: CalendarBroker | null;
  subjectTemplate: string;
  bodyTemplate: string;
  sendHour: number;
  sendMinute: number;
  timezone: "America/Toronto";
  triggerConfig: AutomaticEmailTriggerConfig;
  createdAt: string;
  updatedAt: string;
};

export type AutomaticEmailRuleDraft = Pick<AutomaticEmailRule,
  "ruleType" | "name" | "status" | "executionMode" | "defaultBroker" | "subjectTemplate" | "bodyTemplate" | "sendHour" | "sendMinute" | "timezone" | "triggerConfig"
>;

export type AutomaticEmailRuleRow = {
  id: string;
  rule_type: AutomaticEmailRuleType;
  name: string;
  status: AutomaticEmailRuleStatus;
  execution_mode: AutomaticEmailExecutionMode;
  default_broker: CalendarBroker | null;
  subject_template: string;
  body_template: string;
  send_hour: number;
  send_minute: number;
  timezone: "America/Toronto";
  trigger_config: AutomaticEmailTriggerConfig;
  created_at: string;
  updated_at: string;
};

export type AutomaticEmailOccurrence = {
  occurrenceKey: string;
  ruleId: string;
  ruleType: AutomaticEmailRuleType;
  ruleName: string;
  contactId: string | null;
  transactionId: string | null;
  recipientName: string;
  recipientEmail: string;
  broker: CalendarBroker | null;
  brokerLabel: string;
  scheduledDate: string;
  scheduledTime: string;
  timezone: string;
  subject: string;
  message: string;
  gmailConnected: boolean;
  gmailSignatureReady: boolean;
  blockingReasons: string[];
};

export type AutomaticEmailDelivery = {
  id: string;
  ruleId: string;
  contactId: string | null;
  transactionId: string | null;
  broker: CalendarBroker;
  recipientEmail: string;
  occurrenceKey: string;
  scheduledFor: string;
  status: AutomaticEmailDeliveryStatus;
  createdAt: string;
  updatedAt: string;
};

export const AUTOMATIC_EMAIL_RULE_LABELS: Record<AutomaticEmailRuleType, string> = {
  birthday: "Bonne fête",
  mortgage_renewal: "Renouvellement hypothécaire",
  purchase_anniversary: "Anniversaire d’achat",
  google_review: "Demande d’avis Google",
};

export const AUTOMATIC_EMAIL_RULE_DESCRIPTIONS: Record<AutomaticEmailRuleType, string> = {
  birthday: "Le jour de l’anniversaire du Contact",
  mortgage_renewal: "Avant la date de renouvellement hypothécaire",
  purchase_anniversary: "À l’anniversaire de la date du notaire d’un achat terminé",
  google_review: "Après la conclusion fiable d’une Transaction",
};

export const AUTOMATIC_EMAIL_STATUS_LABELS: Record<AutomaticEmailRuleStatus, string> = {
  draft: "Brouillon",
  ready: "Prête",
  paused: "En pause",
};

export const AUTOMATIC_EMAIL_MODE_LABELS: Record<AutomaticEmailExecutionMode, string> = {
  automatic: "Automatique",
  approval: "À approuver",
};

export const AUTOMATIC_EMAIL_VARIABLES: Record<AutomaticEmailRuleType, readonly string[]> = {
  birthday: ["firstName", "lastName", "fullName"],
  mortgage_renewal: ["firstName", "lastName", "fullName", "mortgageRenewalDate"],
  purchase_anniversary: ["firstName", "lastName", "fullName", "purchaseDate"],
  google_review: ["firstName", "lastName", "fullName", "googleReviewUrl"],
};

export function isAutomaticEmailRuleType(value: unknown): value is AutomaticEmailRuleType {
  return typeof value === "string" && AUTOMATIC_EMAIL_RULE_TYPES.includes(value as AutomaticEmailRuleType);
}

export function isAutomaticEmailRuleStatus(value: unknown): value is AutomaticEmailRuleStatus {
  return typeof value === "string" && AUTOMATIC_EMAIL_RULE_STATUSES.includes(value as AutomaticEmailRuleStatus);
}

export function isAutomaticEmailExecutionMode(value: unknown): value is AutomaticEmailExecutionMode {
  return typeof value === "string" && AUTOMATIC_EMAIL_EXECUTION_MODES.includes(value as AutomaticEmailExecutionMode);
}

export function isAutomaticEmailRuleId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function triggerConfig(value: unknown, ruleType: AutomaticEmailRuleType): AutomaticEmailTriggerConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const data = value as Record<string, unknown>;
  const allowed = ruleType === "mortgage_renewal" ? new Set(["leadMonths"])
    : ruleType === "google_review" ? new Set(["delayDays", "googleReviewUrl"])
      : new Set<string>();
  if (Object.keys(data).some((key) => !allowed.has(key))) return null;
  if (data.leadMonths !== undefined && (!Number.isInteger(data.leadMonths) || Number(data.leadMonths) < 1 || Number(data.leadMonths) > 24)) return null;
  if (data.delayDays !== undefined && (!Number.isInteger(data.delayDays) || Number(data.delayDays) < 0 || Number(data.delayDays) > 365)) return null;
  if (data.googleReviewUrl !== undefined && (typeof data.googleReviewUrl !== "string" || data.googleReviewUrl.length > 2000)) return null;
  return {
    ...(data.leadMonths !== undefined ? { leadMonths: Number(data.leadMonths) } : {}),
    ...(data.delayDays !== undefined ? { delayDays: Number(data.delayDays) } : {}),
    ...(data.googleReviewUrl !== undefined ? { googleReviewUrl: data.googleReviewUrl.trim() } : {}),
  };
}

export function ruleConfigurationIssues(rule: Pick<AutomaticEmailRuleDraft, "ruleType" | "defaultBroker" | "subjectTemplate" | "bodyTemplate" | "triggerConfig">) {
  const issues: string[] = [];
  if (!rule.defaultBroker) issues.push("Choisissez l’expéditeur des contacts non attribués.");
  if (!rule.subjectTemplate.trim()) issues.push("Ajoutez un objet.");
  if (!rule.bodyTemplate.trim()) issues.push("Ajoutez un message.");
  const allowedVariables = new Set(AUTOMATIC_EMAIL_VARIABLES[rule.ruleType]);
  const unknownVariables = [...`${rule.subjectTemplate}\n${rule.bodyTemplate}`.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g)]
    .map((match) => match[1])
    .filter((variable) => !allowedVariables.has(variable));
  if (unknownVariables.length > 0) issues.push(`Variable inconnue : {{${unknownVariables[0]}}}.`);
  if (rule.ruleType === "google_review") {
    const url = rule.triggerConfig.googleReviewUrl?.trim() ?? "";
    if (!url) issues.push("Ajoutez l’URL Avis Google.");
    else {
      try { if (new URL(url).protocol !== "https:") issues.push("L’URL Avis Google doit utiliser HTTPS."); }
      catch { issues.push("L’URL Avis Google est invalide."); }
    }
  }
  return issues;
}

export function parseAutomaticEmailRuleDraft(value: unknown): AutomaticEmailRuleDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const allowed = new Set(["ruleType", "name", "status", "executionMode", "defaultBroker", "subjectTemplate", "bodyTemplate", "sendHour", "sendMinute", "timezone", "triggerConfig"]);
  if (Object.keys(data).some((key) => !allowed.has(key))
    || !isAutomaticEmailRuleType(data.ruleType)
    || !isAutomaticEmailRuleStatus(data.status)
    || !isAutomaticEmailExecutionMode(data.executionMode)
    || (data.defaultBroker !== null && !CONTACT_BROKERS.includes(data.defaultBroker as CalendarBroker))
    || typeof data.name !== "string" || !data.name.trim() || data.name.trim().length > 120
    || typeof data.subjectTemplate !== "string" || data.subjectTemplate.length > 250
    || typeof data.bodyTemplate !== "string" || data.bodyTemplate.length > 100_000
    || !Number.isInteger(data.sendHour) || Number(data.sendHour) < 0 || Number(data.sendHour) > 23
    || !Number.isInteger(data.sendMinute) || Number(data.sendMinute) < 0 || Number(data.sendMinute) > 59
    || data.timezone !== "America/Toronto") return null;
  const parsedTrigger = triggerConfig(data.triggerConfig, data.ruleType);
  if (!parsedTrigger) return null;
  const result: AutomaticEmailRuleDraft = {
    ruleType: data.ruleType,
    name: data.name.trim(),
    status: data.status,
    executionMode: data.executionMode,
    defaultBroker: data.defaultBroker as CalendarBroker | null,
    subjectTemplate: data.subjectTemplate.trim(),
    bodyTemplate: data.bodyTemplate.trim(),
    sendHour: Number(data.sendHour),
    sendMinute: Number(data.sendMinute),
    timezone: "America/Toronto",
    triggerConfig: parsedTrigger,
  };
  return result.status === "ready" && ruleConfigurationIssues(result).length > 0 ? null : result;
}

export function mapAutomaticEmailRuleRow(row: AutomaticEmailRuleRow): AutomaticEmailRule {
  const draft = parseAutomaticEmailRuleDraft({
    ruleType: row.rule_type, name: row.name, status: row.status, executionMode: row.execution_mode,
    defaultBroker: row.default_broker, subjectTemplate: row.subject_template, bodyTemplate: row.body_template,
    sendHour: row.send_hour, sendMinute: row.send_minute, timezone: row.timezone, triggerConfig: row.trigger_config,
  });
  if (!draft) throw new Error("Règle de courriel automatique Supabase invalide.");
  return { id: row.id, ...draft, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function gmailStateForBroker(connections: readonly CalendarConnectionStatus[], broker: CalendarBroker | null) {
  const connection = connections.find((item) => item.broker === broker);
  return {
    connected: Boolean(connection?.gmailSendEnabled),
    signatureReady: Boolean(connection?.gmailSendEnabled && connection.gmailSignatureEnabled),
    email: connection?.email ?? null,
    label: broker ? BROKER_LABELS[broker] : "Non déterminé",
  };
}
