import type { AutomaticEmailRule } from "../../data/automatic-email-types";
import type { ContactBroker } from "../../data/contact-types";
import { resolveAutomaticEmailTemplate, templateVariables } from "../automatic-emails/calculations";

export type BirthdayContact = { id: string; first_name: string; last_name: string; email: string; broker: ContactBroker; birth_date: string | null };
export type BirthdayGreeting = {
  id: string; contact_id: string; occurrence_date: string;
  status: "manual_done" | "manual_sending" | "manual_email_sent" | "auto_sending" | "auto_email_sent" | "failed" | "uncertain";
  sender_broker: Exclude<ContactBroker, "unassigned"> | null;
  gmail_message_id: string | null; error_message: string | null; attempt_token: string;
  automatic_attempted_at: string | null;
};
export const resolvedBirthdayStatuses = new Set(["manual_done", "manual_email_sent", "auto_email_sent"]);
export function birthdayClock(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map(v => [v.type, v.value]));
  return { today: `${p.year}-${p.month}-${p.day}`, afterFive: Number(p.hour) >= 17 };
}
export function birthdaySender(contact: BirthdayContact, rule: AutomaticEmailRule) {
  return contact.broker === "unassigned" ? rule.defaultBroker : contact.broker;
}
export function renderBirthday(contact: BirthdayContact, rule: AutomaticEmailRule, extras: Record<string, string> = {}) {
  const values: Record<string, string> = { firstName: contact.first_name.trim(), lastName: contact.last_name.trim(), fullName: `${contact.first_name} ${contact.last_name}`.trim(), ...extras };
  for (const key of templateVariables(`${rule.subjectTemplate}\n${rule.bodyTemplate}`)) {
    if (!Object.hasOwn(values, key) || !values[key] || /^(undefined|null)$/i.test(values[key])) throw new TypeError(`Variable {{${key}}} manquante ou invalide pour ce contact.`);
  }
  const subject = resolveAutomaticEmailTemplate(rule.subjectTemplate, values);
  const message = resolveAutomaticEmailTemplate(rule.bodyTemplate, values);
  if (/\{\{|\}\}|\b(?:undefined|null)\b|Bonjour\s*,/i.test(`${subject}\n${message}`)) throw new TypeError("Le modèle contient une variable non résolue.");
  return { to: contact.email, subject, message };
}
