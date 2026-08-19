import { describe, expect, it, vi } from "vitest";
import type { Contact } from "../../data/contact-types";
import type { TransactionDraft } from "../../data/transaction-types";
import {
  EMPTY_TRANSACTION_CONTACT_DRAFT,
  createAndLinkTransactionContact,
  filterTransactionContacts,
  findStrongTransactionContactDuplicate,
  linkTransactionContact,
} from "./contact-picker";
import { transactionContactLinkRows, transactionInsertValues } from "./persistence";
import { transactionMatchesSearch } from "./search";
import { mapTransaction, type TransactionRow } from "./server-service";

function contact(index: number, values: Partial<Contact> = {}): Contact {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    firstName: `Prénom${index}`,
    lastName: `Nom${index}`,
    phone: `514555${String(index).padStart(4, "0")}`,
    email: `contact${index}@example.com`,
    civicNumber: "",
    address: "",
    apartment: "",
    city: "Montréal",
    province: "Québec",
    postalCode: "",
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
    buyerPipelineStage: "new",
    sellerPipelineStage: "new",
    addresses: [],
    createdAt: "2026-08-19T12:00:00.000Z",
    updatedAt: "2026-08-19T12:00:00.000Z",
    ...values,
  };
}

function draft(centrisNumber = ""): TransactionDraft {
  return {
    address: " 123, rue Principale ",
    centrisNumber,
    type: "purchase",
    broker: "maxime",
    contactIds: [],
    price: null,
    promiseDate: null,
    status: "new",
    generalNotes: "",
  };
}

describe("numéro Centris d'une transaction", () => {
  it("crée une transaction sans numéro Centris", () => {
    expect(transactionInsertValues(draft()).centris_number).toBe("");
  });

  it("conserve le numéro Centris comme texte en le nettoyant", () => {
    expect(transactionInsertValues(draft(" AB-12345678 ")).centris_number).toBe("AB-12345678");
  });

  it("récupère le numéro Centris après rechargement", () => {
    const row: TransactionRow = {
      id: "transaction-1",
      address: "123, rue Principale",
      centris_number: "12345678",
      type: "purchase",
      broker: "maxime",
      price: null,
      promise_date: null,
      status: "new",
      general_notes: "",
      created_at: "2026-08-19T12:00:00.000Z",
      updated_at: "2026-08-19T12:00:00.000Z",
    };
    expect(mapTransaction(row, [], [], []).centrisNumber).toBe("12345678");
  });

  it("retrouve une transaction par son numéro Centris", () => {
    expect(transactionMatchesSearch({ address: "123, rue Principale", centrisNumber: "12345678" }, "Jean Tremblay", "12345678")).toBe(true);
    expect(transactionMatchesSearch({ address: "123, rue Principale", centrisNumber: "12345678" }, "Jean Tremblay", "87654321")).toBe(false);
  });
});

describe("contacts liés à une nouvelle transaction", () => {
  it("recherche rapidement dans plus de 700 contacts", () => {
    const contacts = Array.from({ length: 750 }, (_, index) => contact(index + 1));
    const target = contacts[721];
    expect(filterTransactionContacts(contacts, target.email)).toEqual([target]);
    expect(filterTransactionContacts(contacts, target.phone)).toEqual([target]);
  });

  it("détecte un courriel ou un téléphone identique, mais pas seulement un nom", () => {
    const existing = contact(1, { firstName: "Jean", lastName: "Tremblay", phone: "514-555-1212", email: "jean@example.com" });
    expect(findStrongTransactionContactDuplicate({ ...EMPTY_TRANSACTION_CONTACT_DRAFT, email: " JEAN@example.com " }, [existing])?.contact.id).toBe(existing.id);
    expect(findStrongTransactionContactDuplicate({ ...EMPTY_TRANSACTION_CONTACT_DRAFT, phone: "1 (514) 555-1212" }, [existing])?.contact.id).toBe(existing.id);
    expect(findStrongTransactionContactDuplicate({ ...EMPTY_TRANSACTION_CONTACT_DRAFT, firstName: "Jean", lastName: "Tremblay" }, [existing])).toBeNull();
  });

  it("enregistre le contact avec addManualContact puis sélectionne son vrai UUID", async () => {
    const saved = contact(42, { firstName: "Marie", lastName: "Gagnon" });
    const addManualContact = vi.fn(async () => saved);
    const input = { ...EMPTY_TRANSACTION_CONTACT_DRAFT, firstName: "Marie", lastName: "Gagnon" };

    const result = await createAndLinkTransactionContact(input, "france", ["contact-existant"], addManualContact);

    expect(addManualContact).toHaveBeenCalledWith(input, "france");
    expect(result.contact).toBe(saved);
    expect(result.contactIds).toEqual(["contact-existant", saved.id]);
  });

  it("conserve plusieurs contacts et produit une seule relation par UUID", () => {
    const selected = linkTransactionContact(linkTransactionContact([], "contact-1"), "contact-2");
    expect(selected).toEqual(["contact-1", "contact-2"]);
    expect(transactionContactLinkRows("transaction-1", [...selected, "contact-1"])).toEqual([
      { transaction_id: "transaction-1", contact_id: "contact-1" },
      { transaction_id: "transaction-1", contact_id: "contact-2" },
    ]);
  });

  it("utilise un contact existant sans créer de doublon", () => {
    expect(linkTransactionContact(["contact-1"], "contact-1")).toEqual(["contact-1"]);
  });

  it("propage une erreur d'enregistrement sans inventer d'UUID", async () => {
    const addManualContact = vi.fn(async () => { throw new Error("Supabase indisponible"); });
    await expect(createAndLinkTransactionContact(
      { ...EMPTY_TRANSACTION_CONTACT_DRAFT, firstName: "Jean" },
      "maxime",
      ["contact-1"],
      addManualContact,
    )).rejects.toThrow("Supabase indisponible");
  });
});
