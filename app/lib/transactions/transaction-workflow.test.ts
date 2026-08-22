import { describe, expect, it, vi } from "vitest";
import type { Contact } from "../../data/contact-types";
import type { Transaction, TransactionDraft } from "../../data/transaction-types";
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
import { findTransactionsWithCentris, normalizeTransactionCentris, runSingleTransactionSave } from "./editor";

function contact(index: number, values: Partial<Contact> = {}): Contact {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    firstName: `Prénom${index}`,
    lastName: `Nom${index}`,
    phone: `514555${String(index).padStart(4, "0")}`,
    email: `contact${index}@example.com`,
    birthDate: "",
    mortgageRenewalDate: "",
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
    addresses: [],
    createdAt: "2026-08-19T12:00:00.000Z",
    updatedAt: "2026-08-19T12:00:00.000Z",
    ...values,
    clientProvenance: values.clientProvenance ?? null,
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

function transaction(id: string, centrisNumber: string, createdAt = "2026-08-20T12:00:00.000Z"): Transaction {
  return {
    id,
    address: `${id} Av. Laurier E., Montréal`,
    centrisNumber,
    type: "sale",
    broker: "maxime",
    contactIds: [],
    price: 500000,
    soldPrice: null,
    promiseDate: null,
    notaryDate: null,
    collaboratingBrokerName: "",
    saleFinalizedAt: null,
    status: "on_market",
    generalNotes: "",
    deadlines: [],
    notes: [],
    sourceListing: null,
    createdAt,
    updatedAt: createdAt,
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
      sold_price: null,
      promise_date: null,
      notary_date: null,
      collaborating_broker_name: "",
      sale_finalized_at: null,
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

  it("ne signale rien pour un numéro vide ou nouveau", () => {
    const transactions = [transaction("transaction-1", "20701687")];
    expect(findTransactionsWithCentris(transactions, "")).toEqual([]);
    expect(findTransactionsWithCentris(transactions, "99999999")).toEqual([]);
  });

  it("détecte un numéro existant avec espaces et casse normalisés", () => {
    const existing = transaction("transaction-1", "ab 20701687");
    expect(normalizeTransactionCentris(" AB  20701687 ")).toBe("AB20701687");
    expect(findTransactionsWithCentris([existing], " AB20701687 ")).toEqual([existing]);
  });

  it("présente la transaction la plus récente lorsqu’il existe plusieurs correspondances", () => {
    const older = transaction("transaction-1", "20701687", "2026-08-19T12:00:00.000Z");
    const newest = transaction("transaction-2", "20701687", "2026-08-20T12:00:00.000Z");
    expect(findTransactionsWithCentris([older, newest], "20701687")).toEqual([newest, older]);
  });

  it("n’exécute qu’une sauvegarde lors de deux soumissions rapides", async () => {
    const lock = { current: false };
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const save = vi.fn(() => pending);
    const first = runSingleTransactionSave(lock, save);
    const second = runSingleTransactionSave(lock, save);
    expect(await second).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toBe(true);
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

    const result = await createAndLinkTransactionContact(input, "france", ["contact-existant"], addManualContact, "referral");

    expect(addManualContact).toHaveBeenCalledWith(input, "france", { clientProvenance: "referral" });
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
