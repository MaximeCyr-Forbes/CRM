import { validateGmailMessage } from "./validation";
export type EmailTemplateContact = { firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null };
/** Missing values remain visible and must never silently become an empty greeting. */
export function resolveEmailTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g,
    (token, name: string) => Object.hasOwn(values, name) && values[name] ? values[name] : token);
}
export function emailContactValues(contact: EmailTemplateContact) {
  const firstName = (contact.firstName ?? "").trim(), lastName = (contact.lastName ?? "").trim();
  return { firstName, lastName, fullName: `${firstName} ${lastName}`.trim(), email: (contact.email ?? "").trim(), phone: (contact.phone ?? "").trim() };
}
export function resolveCustomEmailTemplate(template: string, contact: EmailTemplateContact) {
  return resolveEmailTemplate(template, emailContactValues(contact));
}
export function renderEmailRecipient(subjectTemplate: string, messageTemplate: string, contact: EmailTemplateContact) {
  const subject = resolveCustomEmailTemplate(subjectTemplate, contact);
  const message = resolveCustomEmailTemplate(messageTemplate, contact);
  const to = (contact.email ?? "").trim();
  const blockingReasons: string[] = [];
  if (/\{\{\s*firstName\s*\}\}/.test(`${subjectTemplate}\n${messageTemplate}`) && !(contact.firstName ?? "").trim()) blockingReasons.push("Prénom manquant.");
  try { validateGmailMessage({ to, subject, message }); }
  catch (error) { blockingReasons.push(error instanceof Error ? error.message : "Courriel invalide."); }
  return { to, subject, message, blockingReasons };
}
