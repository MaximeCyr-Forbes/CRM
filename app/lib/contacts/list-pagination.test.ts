import { describe, expect, it } from "vitest";
import {
  CONTACTS_PER_PAGE,
  buildContactProfileHref,
  buildContactReturnTo,
  clampContactsPage,
  contactsListHref,
  contactsNavigationQuery,
  getContactsPaginationItems,
  getContactsTotalPages,
  paginateContacts,
  parseContactsPage,
  safeContactReturnTo,
} from "./list-pagination";

describe("pagination de la liste Contacts", () => {
  it("ne restaure pas une recherche effacée quand le tri précède la mise à jour du routeur", () => {
    const pending = contactsNavigationQuery("page=1&q=obsolete&broker=france", "");
    const sorted = contactsListHref(pending, { sort: "name", page: "1" });
    expect(sorted).toBe("/contacts?page=1&broker=france&sort=name");
    expect(buildContactReturnTo(pending, 3, "qa")).toBe("/contacts?page=3&broker=france#contact-qa");
  });

  it("conserve la nouvelle recherche pour une pagination ou un changement de courtier immédiat", () => {
    const pending = contactsNavigationQuery("q=ancien&followUp=overdue", "nouveau");
    expect(contactsListHref(pending, { broker: "sandrine", page: "1" }))
      .toBe("/contacts?q=nouveau&followUp=overdue&broker=sandrine&page=1");
    expect(contactsListHref(pending, { page: "2" }))
      .toBe("/contacts?q=nouveau&followUp=overdue&page=2");
  });

  const contacts = Array.from({ length: 702 }, (_, index) => index + 1);

  it("affiche exactement 50 Contacts par page", () => {
    expect(CONTACTS_PER_PAGE).toBe(50);
    expect(paginateContacts(contacts, 1).contacts).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    expect(paginateContacts(contacts, 2).contacts).toEqual(Array.from({ length: 50 }, (_, index) => index + 51));
    expect(paginateContacts(contacts, 15).contacts).toEqual([701, 702]);
    expect(getContactsTotalPages(702)).toBe(15);
    expect(getContactsTotalPages(124)).toBe(3);
    expect(getContactsTotalPages(17)).toBe(1);
  });

  it("valide et borne les numéros de page", () => {
    expect(parseContactsPage(null)).toBe(1);
    expect(parseContactsPage("4")).toBe(4);
    expect(parseContactsPage("0")).toBe(1);
    expect(parseContactsPage("-2")).toBe(1);
    expect(parseContactsPage("abc")).toBe(1);
    expect(clampContactsPage(20, 15)).toBe(15);
    expect(paginateContacts(contacts, 99).currentPage).toBe(15);
  });

  it("revient à la dernière page valide après suppression de la dernière ligne", () => {
    const beforeDeletion = Array.from({ length: 201 }, (_, index) => index + 1);
    expect(paginateContacts(beforeDeletion, 5).contacts).toEqual([201]);
    const afterDeletion = beforeDeletion.slice(0, -1);
    const pagination = paginateContacts(afterDeletion, 5);
    expect(pagination.currentPage).toBe(4);
    expect(pagination.contacts[0]).toBe(151);
    expect(pagination.contacts.at(-1)).toBe(200);
  });

  it("crée une fenêtre compacte de pages", () => {
    expect(getContactsPaginationItems(8, 20)).toEqual([1, "ellipsis-left", 6, 7, 8, 9, 10, "ellipsis-right", 20]);
    expect(getContactsPaginationItems(1, 3)).toEqual([1, 2, 3]);
  });

  it("préserve broker, q et followUp tout en permettant de remettre page à 1", () => {
    const current = "broker=maxime&q=tremblay&followUp=overdue&page=8";
    expect(contactsListHref(current, { q: "martin", page: "1" }))
      .toBe("/contacts?broker=maxime&q=martin&followUp=overdue&page=1");
    expect(contactsListHref(current, { broker: "france", page: "1" }))
      .toBe("/contacts?broker=france&q=tremblay&followUp=overdue&page=1");
  });

  it("construit le returnTo avec la page et l’ancre du Contact", () => {
    const returnTo = buildContactReturnTo("broker=maxime&q=abc&page=3", 3, "contact-id");
    expect(returnTo).toBe("/contacts?broker=maxime&q=abc&page=3#contact-contact-id");
    expect(buildContactProfileHref("contact-id", returnTo))
      .toBe("/contacts/contact-id?returnTo=%2Fcontacts%3Fbroker%3Dmaxime%26q%3Dabc%26page%3D3%23contact-contact-id");
  });

  it("refuse toute destination externe ou étrangère aux Contacts", () => {
    expect(safeContactReturnTo("/contacts?broker=maxime&page=4#contact-id")).toBe("/contacts?broker=maxime&page=4#contact-id");
    expect(safeContactReturnTo("https://google.com")).toBe("/contacts");
    expect(safeContactReturnTo("//google.com/contacts")).toBe("/contacts");
    expect(safeContactReturnTo("/contacts-malicious")).toBe("/contacts");
  });
});
