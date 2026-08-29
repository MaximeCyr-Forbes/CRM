import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("pagination et retour dans la liste Contacts", () => {
  const listPage = source("app/contacts/page.tsx");
  const profilePage = source("app/contacts/[contactId]/page.tsx");
  const styles = source("app/globals.css");

  it("remplace Afficher plus par une pagination de la liste filtrée", () => {
    expect(listPage).toContain("paginateContacts(visibleContacts");
    expect(listPage).toContain("getContactsPaginationItems(currentPage, totalPages)");
    expect(listPage).not.toContain("visibleLimit");
    expect(listPage).not.toContain("Afficher 100 contacts de plus");
    expect(listPage).toContain('aria-label="Page précédente"');
    expect(listPage).toContain('aria-label="Page suivante"');
    expect(listPage).toContain('aria-current={item === currentPage ? "page" : undefined}');
  });

  it("garde page, broker, q et followUp dans l’URL sans empiler la frappe", () => {
    expect(listPage).toContain('const querySearch = searchParams.get("q") ?? ""');
    expect(listPage).toContain("router.replace(contactsListHref(currentQuery");
    expect(listPage).toContain('q: value || null');
    expect(listPage).toContain('broker: filter === "all" ? null : filter');
    expect(listPage).toContain('page: "1"');
    expect(listPage).toContain('const queryFollowUp = searchParams.get("followUp")');
  });

  it("ouvre la fiche avec un returnTo et prépare l’historique pour le bouton Retour du navigateur", () => {
    expect(listPage).toContain("buildContactReturnTo(currentQuery, currentPage, contactId)");
    expect(listPage).toContain("window.history.replaceState(window.history.state, \"\", returnTo)");
    expect(listPage).toContain("buildContactProfileHref(contactId, returnTo)");
    expect(listPage).toContain('id={`contact-${contact.id}`}');
  });

  it("place le début de la liste sous le header après une pagination manuelle", () => {
    expect(listPage).toContain("pendingPageScrollRef.current = true");
    expect(listPage).toContain("scrollContactsListAfterPagination(contactsListRef.current)");
    expect(listPage).toContain('document.querySelector<HTMLElement>(".app-header")');
    expect(listPage).toContain("const listTop = list.getBoundingClientRect().top");
    expect(listPage).toContain("window.scrollY + listTop - headerBottom - PAGINATION_LIST_HEADER_GAP");
    expect(listPage).toContain('behavior: "smooth"');
    expect(listPage).not.toContain('contactsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })');
  });

  it("aligne la ligne sous le header réel et la met temporairement en évidence", () => {
    expect(listPage).toContain('window.location.hash.startsWith("#contact-")');
    expect(listPage).toContain('document.querySelector<HTMLElement>(".app-header")');
    expect(listPage).toContain("header?.getBoundingClientRect().bottom ?? 0");
    expect(listPage).toContain("target.getBoundingClientRect().top");
    expect(listPage).toContain("window.scrollTo({");
    expect(listPage).toContain('behavior: "auto"');
    expect(listPage).toContain("layoutFrame = window.requestAnimationFrame");
    expect(listPage).not.toContain('target.scrollIntoView({ block: "center" })');
    expect(listPage).toContain("setHighlightedContactId(contactId)");
    expect(listPage).toContain("1800");
    expect(styles).toContain(".contact-row-return-highlight");
  });

  it("affiche le bouton de retour sécurisé et le conserve après suppression ou fusion", () => {
    expect(profilePage).toContain('safeContactReturnTo(searchParams.get("returnTo"))');
    expect(profilePage).toContain("← RETOUR AUX CONTACTS");
    expect(profilePage).toContain("router.push(returnTo)");
    expect(profilePage).toContain("router.replace(returnTo)");
    expect(profilePage).toContain("?returnTo=${encodeURIComponent(returnTo)}");
  });

  it("limite Tout sélectionner aux identifiants de la page courante et reste compact sur mobile", () => {
    expect(listPage).toContain("toggleVisibleContactSelection(current, pagedContactIds)");
    expect(listPage).toContain("Contacts {pageStart + 1}–{pageEnd} sur {visibleContacts.length}");
    expect(styles).toContain(".contacts-pagination-mobile { display: inline-flex");
    expect(styles).toContain(".contacts-pagination-pages { display: none; }");
  });
});
