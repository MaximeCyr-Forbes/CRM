import { describe, expect, it } from "vitest";
import type { Contact } from "../../data/contact-types";
import type { Listing } from "../../data/listing-types";
import type { Transaction, TransactionDeadline } from "../../data/transaction-types";
import { toLocalISODate } from "../follow-up";
import { birthdayMatchesDate, getDailyNotifications } from "./daily-notifications";

const today = "2026-08-20";

function contact(values: Partial<Contact> = {}): Contact {
  return {
    id: "contact-1",
    firstName: "Jean",
    lastName: "Tremblay",
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
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    ...values,
    clientProvenance: values.clientProvenance ?? null,
  };
}

function deadline(values: Partial<TransactionDeadline> = {}): TransactionDeadline {
  return {
    id: "deadline-1",
    transactionId: "transaction-1",
    title: "Financement",
    dueDate: today,
    dueTime: null,
    completed: false,
    googleCalendarEventId: null,
    googleCalendarEventBroker: null,
    googleCalendarSyncStatus: "synced",
    googleCalendarLastError: null,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    ...values,
  };
}

function transaction(values: Partial<Transaction> = {}): Transaction {
  return {
    id: "transaction-1",
    address: "1010 Av. Laurier E., Montréal",
    centrisNumber: "20701687",
    type: "sale",
    broker: "maxime",
    contactIds: [],
    price: 500000,
    soldPrice: null,
    promiseDate: null,
    notaryDate: null,
    collaboratingBrokerName: "",
    saleFinalizedAt: null,
    purchaseFinalizedAt: null,
    status: "on_market",
    generalNotes: "",
    deadlines: [deadline()],
    notes: [],
    sourceListing: null,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    ...values,
  };
}

function listing(values: Partial<Listing> = {}): Listing {
  return {
    id: "listing-1",
    civicNumber: "1403",
    address: "Rue de Normandie",
    apartment: "",
    city: "Blainville",
    province: "QC",
    postalCode: "J7C 1R1",
    country: "Canada",
    centrisNumber: "12345678",
    broker: "maxime",
    status: "active",
    purpose: "sale",
    askingPrice: 600000,
    monthlyRent: null,
    soldPrice: null,
    notaryDate: null,
    collaboratingBrokerName: "",
    propertyType: "residential",
    listingDate: "2026-05-20",
    expirationDate: today,
    centrisUrl: "",
    publicUrl: "",
    primaryImageUrl: "",
    generalNotes: "",
    ownerContactIds: [],
    createdAt: "2026-05-20T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    ...values,
  };
}

function notifications(values: {
  contacts?: Contact[];
  transactions?: Transaction[];
  listings?: Listing[];
  broker?: "france" | "maxime" | "sandrine";
  date?: string;
}) {
  return getDailyNotifications({
    contacts: values.contacts ?? [],
    transactions: values.transactions ?? [],
    listings: values.listings ?? [],
    broker: values.broker ?? "maxime",
    today: values.date ?? today,
  });
}

describe("notifications quotidiennes du dashboard", () => {
  it("affiche un anniversaire au même mois et jour, peu importe l’année", () => {
    expect(notifications({ contacts: [contact({ birthDate: "1980-08-20" })] })).toMatchObject([
      { id: "birthday:contact-1", type: "birthday", href: "/contacts/contact-1" },
    ]);
    expect(notifications({ contacts: [contact({ birthDate: "2001-08-20" })] })).toHaveLength(1);
    expect(notifications({ contacts: [contact({ birthDate: "1980-08-21" })] })).toEqual([]);
  });

  it("applique au 29 février la même convention que Google Agenda", () => {
    expect(birthdayMatchesDate("1988-02-29", "2028-02-29")).toBe(true);
    expect(birthdayMatchesDate("1988-02-29", "2026-02-28")).toBe(true);
    expect(birthdayMatchesDate("1988-02-29", "2026-03-01")).toBe(false);
  });

  it("affiche seulement le renouvellement hypothécaire daté d’aujourd’hui", () => {
    expect(notifications({ contacts: [contact({ mortgageRenewalDate: today })] })[0]).toMatchObject({
      id: "mortgage:contact-1",
      type: "mortgage_renewal",
    });
    expect(notifications({ contacts: [contact({ mortgageRenewalDate: "2026-08-19" })] })).toEqual([]);
    expect(notifications({ contacts: [contact({ mortgageRenewalDate: "2026-08-21" })] })).toEqual([]);
  });

  it("garde les renouvellements non attribués et anniversaires d’un autre courtier visibles pour l’équipe", () => {
    const results = notifications({ contacts: [
      contact({ id: "unassigned", broker: "unassigned", mortgageRenewalDate: today }),
      contact({ id: "france-birthday", broker: "france", birthDate: "1975-08-20" }),
    ] });
    expect(results.map((item) => item.id)).toEqual(["mortgage:unassigned", "birthday:france-birthday"]);
  });

  it("filtre les relances selon le courtier consulté", () => {
    const results = notifications({ contacts: [
      contact({ id: "maxime", broker: "maxime", nextFollowUpDate: today }),
      contact({ id: "france", broker: "france", nextFollowUpDate: today }),
    ] });
    expect(results).toMatchObject([{ id: "followup:maxime", href: "/contacts/maxime?mode=followups" }]);
  });

  it("retire naturellement la notification de relance lorsque la date devient null", () => {
    const active = notifications({ contacts: [contact({ nextFollowUpDate: today })] });
    const completed = notifications({ contacts: [contact({ nextFollowUpDate: null })] });
    expect(active.some((item) => item.type === "follow_up")).toBe(true);
    expect(completed.some((item) => item.type === "follow_up")).toBe(false);
  });

  it("crée une notification par échéance Transaction active non complétée aujourd’hui", () => {
    const results = notifications({ transactions: [transaction({ deadlines: [
      deadline({ id: "inspection", title: "Inspection" }),
      deadline({ id: "financement", title: "Financement" }),
      deadline({ id: "done", completed: true }),
      deadline({ id: "tomorrow", dueDate: "2026-08-21" }),
    ] })] });
    expect(results.map((item) => item.id)).toEqual([
      "transaction-deadline:financement",
      "transaction-deadline:inspection",
    ]);
    expect(results[0].href).toBe("/transactions/transaction-1");
  });

  it("exclut les Transactions d’un autre courtier, terminées ou annulées", () => {
    expect(notifications({ transactions: [transaction({ broker: "france" })] })).toEqual([]);
    expect(notifications({ transactions: [transaction({ status: "completed" })] })).toEqual([]);
    expect(notifications({ transactions: [transaction({ status: "cancelled" })] })).toEqual([]);
  });

  it("affiche l’expiration d’un Listing pertinent du courtier", () => {
    expect(notifications({ listings: [listing()] })[0]).toMatchObject({
      id: "listing-expiration:listing-1",
      type: "listing_expiration",
      title: "1403 Rue de Normandie",
      href: "/listings/listing-1",
    });
    expect(notifications({ listings: [listing({ broker: "france" })] })).toEqual([]);
  });

  it.each(["sold", "rented", "expired", "withdrawn"] as const)("exclut un Listing au statut %s", (status) => {
    expect(notifications({ listings: [listing({ status })] })).toEqual([]);
  });

  it("trie renouvellement, échéance, Listing, relance puis anniversaire", () => {
    const results = notifications({
      contacts: [contact({ mortgageRenewalDate: today, nextFollowUpDate: today, birthDate: "1980-08-20" })],
      transactions: [transaction()],
      listings: [listing()],
    });
    expect(results.map((item) => item.type)).toEqual([
      "mortgage_renewal",
      "transaction_deadline",
      "listing_expiration",
      "follow_up",
      "birthday",
    ]);
  });

  it("déduplique les événements aux identifiants déterministes", () => {
    const duplicateContact = contact({ mortgageRenewalDate: today });
    const duplicateListing = listing();
    const duplicateTransaction = transaction();
    const results = notifications({
      contacts: [duplicateContact, duplicateContact],
      transactions: [duplicateTransaction, duplicateTransaction],
      listings: [duplicateListing, duplicateListing],
    });
    expect(new Set(results.map((item) => item.id)).size).toBe(results.length);
    expect(results).toHaveLength(3);
  });

  it("utilise explicitement la date locale fournie près de minuit", () => {
    const localNearMidnight = new Date(2026, 7, 20, 0, 5, 0);
    const localToday = toLocalISODate(localNearMidnight);
    expect(localToday).toBe("2026-08-20");
    expect(notifications({ contacts: [contact({ mortgageRenewalDate: localToday })], date: localToday })).toHaveLength(1);
  });
});
