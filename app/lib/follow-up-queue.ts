import type { Contact, ContactBroker } from "../data/contact-types";
import { getContactName } from "../data/contact-types";

export function getFollowUpQueue(
  contacts: ReadonlyArray<Contact>,
  broker: Exclude<ContactBroker, "unassigned">,
  today: string,
  excludeContactId?: string,
) {
  return contacts
    .filter(
      (contact) =>
        contact.id !== excludeContactId &&
        contact.broker === broker &&
        Boolean(contact.nextFollowUpDate && contact.nextFollowUpDate <= today),
    )
    .sort((first, second) => {
      const dateOrder = first.nextFollowUpDate!.localeCompare(second.nextFollowUpDate!);
      return dateOrder || getContactName(first).localeCompare(getContactName(second), "fr-CA");
    });
}
