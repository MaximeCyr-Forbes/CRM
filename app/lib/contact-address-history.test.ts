import { describe, expect, it } from "vitest";
import type { Contact, ContactAddressInput, ContactDraft } from "../data/contact-types";
import {
  addressInputFromDraft,
  dedupeAddresses,
  isAddressHistoryUnavailableError,
  mergeAddressCollections,
  normalizeAddressKey,
  primaryAddressFields,
  setPrimaryAddress,
} from "./contact-addresses";
import { analyzeImportDrafts, decodeContactImportBuffer, parseCSVContacts } from "./contact-import";
import { duplicateConfidence, findDuplicateMatches, searchableContactText } from "./contact-normalization";

const blank: ContactDraft = { firstName: "", lastName: "", phone: "", email: "", birthDate: "", civicNumber: "", address: "", apartment: "", city: "", province: "", postalCode: "", country: "" };

function draft(values: Partial<ContactDraft>): ContactDraft { return { ...blank, ...values }; }
function address(values: Partial<ContactAddressInput>): ContactAddressInput {
  return { ...blank, isPrimary: false, label: "Ancienne adresse", ...values };
}
function contact(values: Partial<Contact> = {}): Contact {
  return {
    id: "contact-1", ...blank, broker: "maxime", clientType: null, priority: null, status: "active", source: "manual",
    lastContactDate: null, nextFollowUpDate: null, googleCalendarEventId: null, googleCalendarEventBroker: null,
    googleCalendarSyncStatus: "synced", googleCalendarLastError: null,
    addresses: [], createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z", ...values,
  };
}

describe("doublons et changements d’adresse", () => {
  const existing = contact({ firstName: "Jean", lastName: "Tremblay", phone: "514-555-1234", email: "JEAN@EXEMPLE.CA", address: "Avenue A" });

  it("A-C détecte un doublon fort par email ou téléphone malgré une nouvelle adresse", () => {
    const both = findDuplicateMatches(draft({ firstName: "Jean", lastName: "Tremblay", phone: "5145551234", email: "jean@exemple.ca", address: "Avenue B" }), [existing])[0];
    const email = findDuplicateMatches(draft({ email: "jean@exemple.ca", address: "Avenue C" }), [existing])[0];
    const phone = findDuplicateMatches(draft({ phone: "1 514 555 1234", address: "Avenue D" }), [existing])[0];
    expect([both.confidence, email.confidence, phone.confidence]).toEqual(["strong", "strong", "strong"]);
  });

  it("D classe un nom seul comme doublon possible nécessitant une vérification", () => {
    const match = findDuplicateMatches(draft({ firstName: "Jean", lastName: "Tremblay", address: "Autre rue" }), [existing])[0];
    expect(match.reasons).toEqual(["name"]);
    expect(match.confidence).toBe("possible");
    expect(duplicateConfidence(match.reasons)).toBe("possible");
  });
});

describe("historique d’adresses", () => {
  const first = address({ civicNumber: "150", address: "Avenue Léo-Lacombe", city: "Deux-Montagnes", province: "QC", isPrimary: true, label: "Principale" });
  const second = address({ civicNumber: "820", address: "25e Avenue", city: "Deux-Montagnes", province: "QC" });
  const third = address({ civicNumber: "123", address: "rue Principale", city: "Oka", province: "QC" });

  it("E-F conserve deux puis trois adresses distinctes", () => {
    expect(mergeAddressCollections([first], [second])).toHaveLength(2);
    expect(mergeAddressCollections([first, second], [third])).toHaveLength(3);
  });

  it("G changer la principale conserve l’ancienne dans l’historique", () => {
    const changed = setPrimaryAddress([first, second], normalizeAddressKey(second));
    expect(changed).toHaveLength(2);
    expect(changed.find((item) => item.isPrimary)?.address).toBe("25e Avenue");
    expect(changed.find((item) => item.address === "Avenue Léo-Lacombe")).toMatchObject({ isPrimary: false, label: "Ancienne adresse" });
    expect(primaryAddressFields(changed).address).toBe("25e Avenue");
  });

  it("H repère deux lignes du même CSV et peut les réunir en un contact avec deux adresses", () => {
    const drafts = parseCSVContacts("Prénom,Nom,Téléphone,Email,Rue\nJean,Tremblay,5145551234,jean@example.ca,150 Avenue A\nJean,Tremblay,5145551234,jean@example.ca,820 Avenue B");
    const candidates = analyzeImportDrafts(drafts, []);
    expect(candidates[1].duplicateDraftIndex).toBe(0);
    const addresses = mergeAddressCollections(
      [addressInputFromDraft(drafts[0])!],
      [addressInputFromDraft(drafts[1], { isPrimary: false })!],
    );
    expect(addresses).toHaveLength(2);
  });

  it("I déduplique une même adresse malgré casse, accents, ponctuation et abréviation", () => {
    const formatted = address({ civicNumber: "150", address: "Av. Léo-Lacombe", city: "Deux-Montagnes", postalCode: "J7R 3W7" });
    const variant = address({ civicNumber: "150", address: "avenue leo lacombe", city: "deux montagnes", postalCode: "J7R3W7" });
    expect(dedupeAddresses([formatted, variant])).toHaveLength(1);
  });

  it("J inclut une ancienne adresse dans la recherche locale", () => {
    const value = contact({ firstName: "Jean", addresses: [{ ...second, id: "a2", contactId: "contact-1", createdAt: "2026-01-01", updatedAt: "2026-01-01" }] });
    expect(searchableContactText(value)).toContain("820 25e avenue");
  });

  it("K-L préserve les accents Windows-1252 et les données NFC", () => {
    const source = "Prénom;Nom;Rue;Ville\r\nBérubé;Côté;Avenue Léo-Lacombe;Deux-Montagnes\r\nBéliveau;Côté;Avenue Léo-Lacombe;Deux-Montagnes";
    const bytes = Uint8Array.from([...source].map((character) => character.codePointAt(0)!));
    const decoded = decodeContactImportBuffer(bytes.buffer);
    const contacts = parseCSVContacts(decoded);
    expect(contacts.map((item) => [item.firstName, item.lastName, item.address, item.city])).toEqual([
      ["Bérubé", "Côté", "Avenue Léo-Lacombe", "Deux-Montagnes"],
      ["Béliveau", "Côté", "Avenue Léo-Lacombe", "Deux-Montagnes"],
    ]);
  });

  it("M reconnaît explicitement l’absence de table ou de RPC pour activer le fallback", () => {
    expect(isAddressHistoryUnavailableError({ code: "42P01", message: "relation contact_addresses does not exist" })).toBe(true);
    expect(isAddressHistoryUnavailableError({ code: "PGRST202", message: "function save_contact_addresses missing" })).toBe(true);
    expect(isAddressHistoryUnavailableError({ code: "42501", message: "permission denied" })).toBe(false);
  });
});
