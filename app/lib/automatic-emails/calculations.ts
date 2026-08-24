import type { CalendarConnectionStatus } from "../../data/calendar-types";
import { BROKER_LABELS, type ContactBroker } from "../../data/contact-types";
import type {
  AutomaticEmailOccurrence,
  AutomaticEmailRule,
  AutomaticEmailRuleType,
} from "../../data/automatic-email-types";
import { AUTOMATIC_EMAIL_VARIABLES, gmailStateForBroker, ruleConfigurationIssues } from "../../data/automatic-email-types";
import type { CalendarBroker } from "../../data/calendar-types";

export type AutomaticEmailContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  broker: ContactBroker;
  birthDate: string | null;
  mortgageRenewalDate: string | null;
};

export type AutomaticEmailTransaction = {
  id: string;
  type: "purchase" | "sale";
  status: string;
  notaryDate: string | null;
  saleFinalizedAt: string | null;
};

export type AutomaticEmailTransactionContact = { transactionId: string; contactId: string };

export type AutomaticEmailPreviewDataset = {
  contacts: AutomaticEmailContact[];
  transactions: AutomaticEmailTransaction[];
  transactionContacts: AutomaticEmailTransactionContact[];
  connections: CalendarConnectionStatus[];
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parts(value: string) {
  return value.split("-").map(Number) as [number, number, number];
}

function dateKey(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function validDate(year: number, month: number, day: number) {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? dateKey(year, month, day)
    : null;
}

function addDays(value: string, days: number) {
  const [year, month, day] = parts(value);
  const parsed = new Date(Date.UTC(year, month - 1, day + days));
  return dateKey(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
}

function subtractMonths(value: string, months: number) {
  const [year, month, day] = parts(value);
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return dateKey(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(day, lastDay));
}

function anniversaryDates(source: string, from: string, to: string) {
  if (!DATE_PATTERN.test(source)) return [];
  const [, month, day] = parts(source);
  const [fromYear] = parts(from);
  const [toYear] = parts(to);
  const dates: string[] = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    const date = validDate(year, month, day);
    if (date && date >= from && date <= to) dates.push(date);
  }
  return dates;
}

function businessDate(value: string) {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

export function templateVariables(template: string) {
  return [...template.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g)].map((match) => match[1]);
}

export function invalidTemplateVariables(ruleType: AutomaticEmailRuleType, template: string) {
  const allowed = new Set(AUTOMATIC_EMAIL_VARIABLES[ruleType]);
  return [...new Set(templateVariables(template).filter((name) => !allowed.has(name)))];
}

export function resolveAutomaticEmailTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g, (_, name: string) => values[name] ?? "");
}

function contactVariables(contact: AutomaticEmailContact, extras: Record<string, string> = {}) {
  const fullName = `${contact.firstName} ${contact.lastName}`.trim();
  return { firstName: contact.firstName, lastName: contact.lastName, fullName, ...extras };
}

function assignedBroker(contact: AutomaticEmailContact, rule: AutomaticEmailRule): CalendarBroker | null {
  return contact.broker === "unassigned" ? rule.defaultBroker : contact.broker;
}

function occurrence(
  rule: AutomaticEmailRule,
  contact: AutomaticEmailContact,
  dataset: AutomaticEmailPreviewDataset,
  input: { key: string; date: string; transactionId?: string | null; variables?: Record<string, string> },
): AutomaticEmailOccurrence {
  const broker = assignedBroker(contact, rule);
  const gmail = gmailStateForBroker(dataset.connections, broker);
  const variables = contactVariables(contact, input.variables);
  const blockingReasons = [...ruleConfigurationIssues(rule)];
  if (!contact.email.trim()) blockingReasons.push("Adresse courriel manquante.");
  if (!broker) blockingReasons.push("Expéditeur non déterminé.");
  if (broker && !gmail.connected) blockingReasons.push(`Gmail n’est pas connecté pour ${BROKER_LABELS[broker]}.`);
  if (broker && gmail.connected && !gmail.signatureReady) blockingReasons.push(`La signature Gmail n’est pas autorisée pour ${BROKER_LABELS[broker]}.`);
  if (invalidTemplateVariables(rule.ruleType, `${rule.subjectTemplate}\n${rule.bodyTemplate}`).length > 0) blockingReasons.push("Le modèle contient une variable inconnue.");
  return {
    occurrenceKey: input.key,
    ruleId: rule.id,
    ruleType: rule.ruleType,
    ruleName: rule.name,
    contactId: contact.id,
    transactionId: input.transactionId ?? null,
    recipientName: variables.fullName || "Contact sans nom",
    recipientEmail: contact.email.trim(),
    broker,
    brokerLabel: gmail.label,
    scheduledDate: input.date,
    scheduledTime: `${rule.sendHour.toString().padStart(2, "0")}:${rule.sendMinute.toString().padStart(2, "0")}`,
    timezone: rule.timezone,
    subject: resolveAutomaticEmailTemplate(rule.subjectTemplate, variables),
    message: resolveAutomaticEmailTemplate(rule.bodyTemplate, variables),
    gmailConnected: gmail.connected,
    gmailSignatureReady: gmail.signatureReady,
    blockingReasons: [...new Set(blockingReasons)],
  };
}

function contactForTransaction(dataset: AutomaticEmailPreviewDataset, transactionId: string) {
  const contactIds = dataset.transactionContacts.filter((item) => item.transactionId === transactionId).map((item) => item.contactId);
  return contactIds.map((id) => dataset.contacts.find((contact) => contact.id === id)).find(Boolean) ?? null;
}

function occurrencesForRule(rule: AutomaticEmailRule, dataset: AutomaticEmailPreviewDataset, from: string, to: string) {
  const values: AutomaticEmailOccurrence[] = [];
  if (rule.ruleType === "birthday") {
    for (const contact of dataset.contacts) for (const date of anniversaryDates(contact.birthDate ?? "", from, to)) {
      values.push(occurrence(rule, contact, dataset, { key: `birthday:${contact.id}:${date.slice(0, 4)}`, date }));
    }
  }
  if (rule.ruleType === "mortgage_renewal") {
    const leadMonths = rule.triggerConfig.leadMonths ?? 6;
    for (const contact of dataset.contacts) {
      const renewalDate = contact.mortgageRenewalDate;
      if (!renewalDate || !DATE_PATTERN.test(renewalDate)) continue;
      const date = subtractMonths(renewalDate, leadMonths);
      if (date < from || date > to) continue;
      values.push(occurrence(rule, contact, dataset, {
        key: `mortgage:${contact.id}:${date}`,
        date,
        variables: { mortgageRenewalDate: businessDate(renewalDate) },
      }));
    }
  }
  if (rule.ruleType === "purchase_anniversary") {
    for (const transaction of dataset.transactions.filter((item) => item.type === "purchase" && item.status === "completed" && item.notaryDate)) {
      const contact = contactForTransaction(dataset, transaction.id);
      if (!contact) continue;
      for (const date of anniversaryDates(transaction.notaryDate!, from, to)) {
        values.push(occurrence(rule, contact, dataset, {
          key: `purchase-anniversary:${transaction.id}:${contact.id}:${date.slice(0, 4)}`,
          date,
          transactionId: transaction.id,
          variables: { purchaseDate: businessDate(transaction.notaryDate!) },
        }));
      }
    }
  }
  if (rule.ruleType === "google_review") {
    const delayDays = rule.triggerConfig.delayDays ?? 3;
    for (const transaction of dataset.transactions.filter((item) => item.status === "completed")) {
      const concluded = transaction.type === "purchase" ? transaction.notaryDate : transaction.saleFinalizedAt?.slice(0, 10) ?? null;
      if (!concluded || !DATE_PATTERN.test(concluded)) continue;
      const date = addDays(concluded, delayDays);
      if (date < from || date > to) continue;
      const contact = contactForTransaction(dataset, transaction.id);
      if (!contact) continue;
      values.push(occurrence(rule, contact, dataset, {
        key: `google-review:${transaction.id}`,
        date,
        transactionId: transaction.id,
        variables: { googleReviewUrl: rule.triggerConfig.googleReviewUrl ?? "" },
      }));
    }
  }
  return values;
}

export function calculateAutomaticEmailOccurrences(
  rules: readonly AutomaticEmailRule[],
  dataset: AutomaticEmailPreviewDataset,
  from: string,
  to: string,
) {
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) throw new TypeError("Période de simulation invalide.");
  const unique = new Map<string, AutomaticEmailOccurrence>();
  for (const rule of rules) for (const item of occurrencesForRule(rule, dataset, from, to)) {
    unique.set(`${rule.id}:${item.occurrenceKey}`, item);
  }
  return [...unique.values()].sort((first, second) => `${first.scheduledDate}:${first.scheduledTime}:${first.recipientName}`.localeCompare(`${second.scheduledDate}:${second.scheduledTime}:${second.recipientName}`));
}

export function occurrenceSummary(occurrences: readonly AutomaticEmailOccurrence[], today: string) {
  const tomorrow = addDays(today, 1);
  const inSevenDays = addDays(today, 7);
  return {
    today: occurrences.filter((item) => item.scheduledDate === today).length,
    tomorrow: occurrences.filter((item) => item.scheduledDate === tomorrow).length,
    nextSevenDays: occurrences.filter((item) => item.scheduledDate >= today && item.scheduledDate <= inSevenDays).length,
  };
}
