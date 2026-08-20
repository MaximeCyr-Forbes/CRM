import type { Contact, ContactBroker, ContactDraft } from "../../data/contact-types";
import { findDuplicateMatches, normalizeName, searchableContactText } from "../contact-normalization";

export const EMPTY_TRANSACTION_CONTACT_DRAFT: ContactDraft = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  birthDate: "",
  mortgageRenewalDate: "",
  civicNumber: "",
  address: "",
  apartment: "",
  city: "",
  province: "",
  postalCode: "",
  country: "",
};

export function filterTransactionContacts(
  contacts: ReadonlyArray<Contact>,
  query: string,
) {
  const terms = normalizeName(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...contacts];
  return contacts.filter((contact) => {
    const haystack = searchableContactText(contact);
    return terms.every((term) => haystack.includes(term));
  });
}

export function findStrongTransactionContactDuplicate(
  draft: ContactDraft,
  contacts: ReadonlyArray<Contact>,
) {
  return findDuplicateMatches(draft, contacts).find((match) =>
    match.reasons.includes("email") || match.reasons.includes("phone"),
  ) ?? null;
}

export function linkTransactionContact(contactIds: ReadonlyArray<string>, contactId: string) {
  return contactIds.includes(contactId) ? [...contactIds] : [...contactIds, contactId];
}

export async function createAndLinkTransactionContact(
  draft: ContactDraft,
  broker: Exclude<ContactBroker, "unassigned">,
  contactIds: ReadonlyArray<string>,
  addManualContact: (draft: ContactDraft, broker: Exclude<ContactBroker, "unassigned">) => Promise<Contact>,
) {
  const contact = await addManualContact(draft, broker);
  return { contact, contactIds: linkTransactionContact(contactIds, contact.id) };
}
