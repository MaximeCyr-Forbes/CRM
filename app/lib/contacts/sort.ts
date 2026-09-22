import { getContactName, type Contact } from "../../data/contact-types";

export function parseContactSort(value: string | null) { return value === "name" ? "name" : "created"; }
export function compareContacts(sort: "name" | "created") {
  return (a: Contact, b: Contact) => (sort === "name" ? getContactName(a).localeCompare(getContactName(b), "fr-CA", { sensitivity: "base", numeric: true }) : 0)
    || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id, "fr-CA", { numeric: true });
}
