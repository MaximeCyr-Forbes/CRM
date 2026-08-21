import { describe, expect, it, vi } from "vitest";
import type { Contact, ContactDraft } from "../../data/contact-types";
import {
  LISTING_BROKERS,
  LISTING_PROPERTY_TYPES,
  type Listing,
} from "../../data/listing-types";
import {
  RENTAL_LISTING_STATUSES,
  SALE_LISTING_STATUSES,
  acquireListingSubmissionLock,
  emptyListingDraft,
  findListingWithCentrisNumber,
  listingDraftFromListing,
  normalizeListingCentrisNumber,
  prepareListingDraft,
  releaseListingSubmissionLock,
  toggleListingOwner,
  validStatusForListingPurpose,
} from "./editor";
import {
  createAndLinkTransactionContact,
  filterTransactionContacts,
  findStrongTransactionContactDuplicate,
  linkTransactionContact,
} from "../transactions/contact-picker";

const owner1 = "00000000-0000-4000-8000-000000000001";
const owner2 = "00000000-0000-4000-8000-000000000002";

function contact(values: Partial<Contact> & Pick<Contact, "id">): Contact {
  return {
    firstName: "Jean",
    lastName: "Tremblay",
    phone: "514-555-1234",
    email: "jean@example.com",
    birthDate: "",
    mortgageRenewalDate: "",
    civicNumber: "1403",
    address: "rue de Normandie",
    apartment: "",
    city: "Deux-Montagnes",
    province: "QC",
    postalCode: "J7R 1T1",
    country: "Canada",
    broker: "maxime",
    clientType: null,
    priority: null,
    status: "active",
    source: "manual",
    lastContactDate: null,
    nextFollowUpDate: null,
    googleCalendarEventId: null,
    googleCalendarEventBroker: null,
    googleCalendarSyncStatus: "synced",
    googleCalendarLastError: null,
    addresses: [],
    createdAt: "2026-08-19T20:00:00.000Z",
    updatedAt: "2026-08-19T20:00:00.000Z",
    ...values,
    clientProvenance: values.clientProvenance ?? null,
  };
}

function persistedListing(values: Partial<Listing> = {}): Listing {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    civicNumber: "1403",
    address: "rue de Normandie",
    apartment: "6",
    city: "Deux-Montagnes",
    province: "QC",
    postalCode: "J7R 1T1",
    country: "Canada",
    centrisNumber: "12345678",
    broker: "maxime",
    status: "active",
    purpose: "sale",
    askingPrice: 799000,
    monthlyRent: null,
    propertyType: "residential",
    listingDate: "2026-08-19",
    expirationDate: "2027-02-19",
    centrisUrl: "https://www.centris.ca/example",
    publicUrl: "https://equipeforbes.ca/example",
    primaryImageUrl: "https://example.com/home.jpg",
    generalNotes: "Notes internes",
    ownerContactIds: [owner1, owner2],
    createdAt: "2026-08-19T20:00:00.000Z",
    updatedAt: "2026-08-19T20:00:00.000Z",
    ...values,
  };
}

describe("formulaire Nouveau Listing", () => {
  it("préremplit Vente, Préparation, Résidentiel, QC, Canada et le courtier consulté", () => {
    for (const broker of LISTING_BROKERS) {
      expect(emptyListingDraft(broker)).toMatchObject({
        purpose: "sale",
        status: "preparation",
        propertyType: "residential",
        province: "QC",
        country: "Canada",
        broker,
      });
    }
  });

  it("propose Vendu seulement pour Vente et Loué seulement pour Location", () => {
    expect(SALE_LISTING_STATUSES).toContain("sold");
    expect(SALE_LISTING_STATUSES).not.toContain("rented");
    expect(RENTAL_LISTING_STATUSES).toContain("rented");
    expect(RENTAL_LISTING_STATUSES).not.toContain("sold");
    expect(validStatusForListingPurpose("rental", "sold")).toBe("active");
    expect(validStatusForListingPurpose("sale", "rented")).toBe("active");
  });

  it("enregistre un prix de Vente et efface toujours le loyer", () => {
    const result = prepareListingDraft({ ...emptyListingDraft("france"), address: "rue Principale" }, "799000", "2450");
    expect(result).toMatchObject({ error: null, draft: { purpose: "sale", askingPrice: 799000, monthlyRent: null } });
  });

  it("enregistre un loyer de Location et efface toujours le prix demandé", () => {
    const result = prepareListingDraft({ ...emptyListingDraft("sandrine"), address: "rue Principale", purpose: "rental" }, "799000", "2450");
    expect(result).toMatchObject({ error: null, draft: { purpose: "rental", askingPrice: null, monthlyRent: 2450 } });
  });

  it("accepte les six types de propriétés", () => {
    for (const propertyType of LISTING_PROPERTY_TYPES) {
      expect(prepareListingDraft({ ...emptyListingDraft("maxime"), address: "rue Principale", propertyType }, "0", "").error).toBeNull();
    }
  });

  it("accepte Centris vide ou renseigné et conserve sa valeur texte", () => {
    const empty = prepareListingDraft({ ...emptyListingDraft("maxime"), address: "rue Principale" }, "", "");
    const centris = prepareListingDraft({ ...emptyListingDraft("maxime"), address: "rue Principale", centrisNumber: " 12 345 678 " }, "", "");
    expect(empty.draft?.centrisNumber).toBe("");
    expect(centris.draft?.centrisNumber).toBe("12 345 678");
  });

  it("refuse une adresse absente, un montant négatif et des dates incohérentes", () => {
    expect(prepareListingDraft(emptyListingDraft("maxime"), "", "").error).toContain("adresse identifiable");
    expect(prepareListingDraft({ ...emptyListingDraft("maxime"), address: "rue Principale" }, "-1", "").error).toContain("prix demandé");
    expect(prepareListingDraft({ ...emptyListingDraft("maxime"), address: "rue Principale", purpose: "rental" }, "", "-1").error).toContain("loyer mensuel");
    expect(prepareListingDraft({ ...emptyListingDraft("maxime"), address: "rue Principale", listingDate: "2026-09-01", expirationDate: "2026-08-01" }, "", "").error).toContain("date d’expiration");
  });
});

describe("propriétaires liés", () => {
  const contacts = [
    contact({ id: owner1 }),
    contact({ id: owner2, firstName: "Marie", phone: "450-555-9876", email: "marie@example.com" }),
  ];

  it("recherche un Contact par nom, téléphone, courriel ou adresse", () => {
    expect(filterTransactionContacts(contacts, "Jean").map((item) => item.id)).toEqual([owner1]);
    expect(filterTransactionContacts(contacts, "4505559876").map((item) => item.id)).toEqual([owner2]);
    expect(filterTransactionContacts(contacts, "marie@example.com").map((item) => item.id)).toEqual([owner2]);
    expect(filterTransactionContacts(contacts, "Normandie")).toHaveLength(2);
  });

  it("sélectionne plusieurs propriétaires, conserve la sélection et retire seulement le lien", () => {
    const selected = toggleListingOwner(toggleListingOwner([], owner1), owner2);
    expect(selected).toEqual([owner1, owner2]);
    expect(filterTransactionContacts(contacts, "Marie")).toEqual([contacts[1]]);
    expect(selected).toEqual([owner1, owner2]);
    expect(toggleListingOwner(selected, owner1)).toEqual([owner2]);
    expect(contacts).toHaveLength(2);
  });

  it("détecte les doublons forts par courriel et téléphone", () => {
    const emailDraft = { ...contacts[0], email: "JEAN@example.com" } satisfies ContactDraft;
    const phoneDraft = { ...contacts[0], email: "", phone: "1 (514) 555-1234" } satisfies ContactDraft;
    expect(findStrongTransactionContactDuplicate(emailDraft, contacts)?.contact.id).toBe(owner1);
    expect(findStrongTransactionContactDuplicate(phoneDraft, contacts)?.contact.id).toBe(owner1);
  });

  it("utilise un Contact existant sans dupliquer son UUID", () => {
    expect(linkTransactionContact([owner1], owner1)).toEqual([owner1]);
    expect(linkTransactionContact([owner1], owner2)).toEqual([owner1, owner2]);
  });

  it("crée un Contact permanent avec le courtier du Listing puis lie son UUID réel", async () => {
    const draft = { ...contacts[1], id: undefined } as unknown as ContactDraft;
    const saved = contact({ id: "00000000-0000-4000-8000-000000000003", firstName: "Pierre" });
    const addManualContact = vi.fn(async () => saved);
    const result = await createAndLinkTransactionContact(draft, "france", [owner1], addManualContact, "prospecting");
    expect(addManualContact).toHaveBeenCalledWith(draft, "france", { clientProvenance: "prospecting" });
    expect(result.contact.id).toBe(saved.id);
    expect(result.contactIds).toEqual([owner1, saved.id]);
  });
});

describe("protection locale des numéros Centris", () => {
  it("normalise les espaces et la casse puis retrouve le Listing existant", () => {
    const listing = persistedListing();
    expect(normalizeListingCentrisNumber(" 12 345 abc ")).toBe("12345ABC");
    expect(findListingWithCentrisNumber([listing], "12 345 678")?.id).toBe(listing.id);
    expect(findListingWithCentrisNumber([listing], "")).toBeNull();
    expect(findListingWithCentrisNumber([listing], "99999999")).toBeNull();
  });
});

describe("verrou de soumission Listing", () => {
  it("n’accorde qu’une création à deux soumissions rapides puis se libère", () => {
    const lock = { current: false };
    expect(acquireListingSubmissionLock(lock)).toBe(true);
    expect(acquireListingSubmissionLock(lock)).toBe(false);
    releaseListingSubmissionLock(lock);
    expect(acquireListingSubmissionLock(lock)).toBe(true);
  });
});

describe("modification rapide", () => {
  it("préremplit tous les champs persistés sans recréer l’UUID", () => {
    const listing = persistedListing();
    const draft = listingDraftFromListing(listing);
    expect(draft).toEqual(expect.objectContaining({
      purpose: listing.purpose,
      address: listing.address,
      centrisNumber: listing.centrisNumber,
      broker: listing.broker,
      status: listing.status,
      askingPrice: listing.askingPrice,
      monthlyRent: listing.monthlyRent,
      propertyType: listing.propertyType,
      listingDate: listing.listingDate,
      expirationDate: listing.expirationDate,
      centrisUrl: listing.centrisUrl,
      publicUrl: listing.publicUrl,
      primaryImageUrl: listing.primaryImageUrl,
      generalNotes: listing.generalNotes,
      ownerContactIds: listing.ownerContactIds,
    }));
    expect(draft).not.toHaveProperty("id");
    expect(listing.id).toBe("10000000-0000-4000-8000-000000000001");
  });
});
