import type { Contact, ContactDraft } from "../data/contact-types";

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function normalizeEmail(value: string) {
  return value.trim().toLocaleLowerCase("fr-CA");
}

export function normalizeName(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLocaleLowerCase("fr-CA");
}

export function normalizeFullName(contact: ContactDraft) {
  return normalizeName(`${contact.firstName} ${contact.lastName}`);
}

export function hasMinimumContactIdentity(contact: ContactDraft) {
  return Boolean(
    normalizeFullName(contact) || normalizePhone(contact.phone) || normalizeEmail(contact.email),
  );
}

export type DuplicateReason = "phone" | "email" | "name";

export type DuplicateMatch = {
  contact: Contact;
  reasons: DuplicateReason[];
};

export function getDuplicateReasons(
  candidate: ContactDraft,
  existing: ContactDraft,
): DuplicateReason[] {
  const reasons: DuplicateReason[] = [];
  const candidatePhone = normalizePhone(candidate.phone);
  const existingPhone = normalizePhone(existing.phone);
  const candidateEmail = normalizeEmail(candidate.email);
  const existingEmail = normalizeEmail(existing.email);
  const candidateName = normalizeFullName(candidate);
  const existingName = normalizeFullName(existing);

  if (candidatePhone && candidatePhone === existingPhone) reasons.push("phone");
  if (candidateEmail && candidateEmail === existingEmail) reasons.push("email");
  if (candidateName && candidateName === existingName) reasons.push("name");
  return reasons;
}

export function findDuplicateMatches(
  candidate: ContactDraft,
  contacts: ReadonlyArray<Contact>,
) {
  return contacts.flatMap<DuplicateMatch>((contact) => {
    const reasons = getDuplicateReasons(candidate, contact);
    return reasons.length > 0 ? [{ contact, reasons }] : [];
  });
}

export function searchableContactText(contact: ContactDraft) {
  return [
    normalizeName(contact.firstName),
    normalizeName(contact.lastName),
    normalizeFullName(contact),
    normalizePhone(contact.phone),
    normalizeEmail(contact.email),
  ].join(" ");
}
