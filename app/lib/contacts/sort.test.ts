import { describe, expect, it } from "vitest";
import type { Contact } from "../../data/contact-types";
import { compareContacts, parseContactSort } from "./sort";
import { buildContactReturnTo, contactsListHref, paginateContacts } from "./list-pagination";
const contact = (id: string, firstName: string, createdAt = "2026-01-01") => ({ id, firstName, lastName: "", createdAt } as Contact);
describe("contact sorting", () => {
  it("defaults to newest first", () => { expect(parseContactSort(null)).toBe("created"); expect(parseContactSort("invalid")).toBe("created"); expect([contact("old","A"),contact("new","Z","2026-09-22")].sort(compareContacts("created"))[0].id).toBe("new"); });
  it("orders French accents and ties deterministically", () => { const rows=[contact("z","Zoé"),contact("e","Émile"),contact("a","Àline"),contact("m","Marie-Claude"),contact("e2","Emile","2026-09-22")]; expect(rows.sort(compareContacts("name")).map(c=>c.id)).toEqual(["a","e2","e","m","z"]); });
  it("sorts the whole list before pagination", () => { const rows=Array.from({length:101},(_,i)=>contact(String(i),`Personne ${101-i}`)); const page=paginateContacts(rows.sort(compareContacts("name")),2); expect(page.contacts[0].firstName).toBe("Personne 51"); });
  it("retains search/filter/returnTo and resets only the page", () => { const href=contactsListHref("q=Marie&broker=france&followUp=overdue&page=4",{sort:"name",page:"1"}); expect(href).toContain("q=Marie&broker=france&followUp=overdue&page=1&sort=name"); expect(buildContactReturnTo("sort=name&q=Marie&page=4",4,"example")).toBe("/contacts?sort=name&q=Marie&page=4#contact-example"); });
});
