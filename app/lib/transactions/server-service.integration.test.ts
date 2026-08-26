import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionDraft } from "../../data/transaction-types";

const supabase = vi.hoisted(() => ({ getAdmin: vi.fn() }));
vi.mock("../supabase/server", () => ({ getSupabaseAdmin: supabase.getAdmin }));

import {
  completeTransactionPurchase,
  completeTransactionSale,
  createTransaction,
  listTransactions,
  TRANSACTION_RELATION_BATCH_SIZE,
  updateTransaction,
  type TransactionRow,
} from "./server-service";

const row: TransactionRow = {
  id: "transaction-1",
  address: "1010 Av. Laurier E., Montréal",
  centris_number: "20701687",
  type: "sale",
  broker: "maxime",
  price: 500000,
  sold_price: null,
  promise_date: null,
  notary_date: null,
  collaborating_broker_name: "",
  sale_finalized_at: null,
  purchase_finalized_at: null,
  status: "on_market",
  general_notes: "",
  created_at: "2026-08-20T12:00:00.000Z",
  updated_at: "2026-08-20T12:00:00.000Z",
};

const draft: TransactionDraft = {
  address: row.address,
  centrisNumber: row.centris_number,
  type: row.type,
  broker: row.broker,
  contactIds: ["contact-1"],
  price: Number(row.price),
  promiseDate: row.promise_date,
  status: row.status,
  generalNotes: row.general_notes,
};

function readableQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    in: vi.fn(() => query),
    range: vi.fn(async (from: number, to: number) => ({
      data: Array.isArray(result.data) ? result.data.slice(from, to + 1) : result.data,
      error: result.error,
    })),
    then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function tableQuery(rows: ReadonlyArray<Record<string, unknown>>, receivedBatches: string[][]) {
  return {
    select: () => {
      let filtered = [...rows];
      const query = {
        in: (_column: string, ids: string[]) => {
          receivedBatches.push([...ids]);
          filtered = rows.filter((item) => ids.includes(String(item.transaction_id)));
          return query;
        },
        order: () => query,
        range: async (from: number, to: number) => ({ data: filtered.slice(from, to + 1), error: null }),
      };
      return query;
    },
  };
}

describe("service Transactions sans dépendance obligatoire aux Listings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    supabase.getAdmin.mockReset();
  });

  it("liste les transactions même si listing_transaction_links est indisponible", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const from = vi.fn((table: string) => {
      if (table === "transactions") return readableQuery({ data: [row], error: null });
      if (table === "listing_transaction_links") return readableQuery({ data: null, error: { code: "PGRST205", message: "Missing from schema cache" } });
      return readableQuery({ data: [], error: null });
    });
    supabase.getAdmin.mockReturnValue({ from });

    const result = await listTransactions();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: row.id, sourceListing: null });
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("charge 1300 Transactions et 1500 notes sans troncature ni lot UUID démesuré", async () => {
    const transactionRows = Array.from({ length: 1300 }, (_, index) => ({
      ...row,
      id: `transaction-${index}`,
      address: `${index} rue Principale`,
      updated_at: `2026-08-${String((index % 24) + 1).padStart(2, "0")}T12:00:00.000Z`,
    }));
    const noteRows = Array.from({ length: 1500 }, (_, index) => ({
      id: `note-${index}`,
      transaction_id: "transaction-0",
      content: `Note ${index}`,
      created_at: `2026-08-24T12:${String(index % 60).padStart(2, "0")}:00.000Z`,
    }));
    const contactRows = transactionRows.map((transaction, index) => ({
      transaction_id: transaction.id,
      contact_id: `contact-${index}`,
    }));
    const deadlineRows = transactionRows.map((transaction, index) => ({
      id: `deadline-${index}`,
      transaction_id: transaction.id,
      title: `Échéance ${index}`,
      due_date: "2026-09-01",
      due_time: null,
      completed: false,
      google_calendar_event_id: null,
      google_calendar_event_broker: null,
      google_calendar_sync_status: "not_synced",
      google_calendar_last_error: null,
      created_at: "2026-08-24T12:00:00.000Z",
      updated_at: "2026-08-24T12:00:00.000Z",
    }));
    const listingLinkRows = transactionRows.map((transaction, index) => ({
      transaction_id: transaction.id,
      listing_id: `listing-${index}`,
      offer_id: `offer-${index}`,
      listings: {
        civic_number: String(index),
        address: "rue Principale",
        apartment: "",
        city: "Montréal",
        province: "QC",
        postal_code: "H2X 1Y4",
      },
    }));
    const receivedBatches: string[][] = [];
    const from = vi.fn((table: string) => {
      if (table === "transactions") return tableQuery(transactionRows, receivedBatches);
      if (table === "transaction_notes") return tableQuery(noteRows, receivedBatches);
      if (table === "transaction_contacts") return tableQuery(contactRows, receivedBatches);
      if (table === "transaction_deadlines") return tableQuery(deadlineRows, receivedBatches);
      if (table === "listing_transaction_links") return tableQuery(listingLinkRows, receivedBatches);
      return tableQuery([], receivedBatches);
    });
    supabase.getAdmin.mockReturnValue({ from });

    const result = await listTransactions();

    expect(result).toHaveLength(1300);
    expect(result.find((transaction) => transaction.id === "transaction-0")?.notes).toHaveLength(1500);
    expect(result.find((transaction) => transaction.id === "transaction-1299")).toMatchObject({
      contactIds: ["contact-1299"],
      deadlines: [{ id: "deadline-1299" }],
      sourceListing: { listingId: "listing-1299", offerId: "offer-1299" },
    });
    expect(Math.max(...receivedBatches.map((batch) => batch.length))).toBeLessThanOrEqual(TRANSACTION_RELATION_BATCH_SIZE);
  });

  it("crée atomiquement la Transaction et ses Contacts avec une clé idempotente", async () => {
    const creationKey = "b7fb7047-6f55-4d32-81d8-eec032de6ebb";
    const rpc = vi.fn(async (_name: string, _values: { p_creation_key: string }) => ({ data: row, error: null }));
    const receivedBatches: string[][] = [];
    const from = vi.fn((table: string) => tableQuery(
      table === "transaction_contacts"
        ? [{ transaction_id: row.id, contact_id: "contact-1" }]
        : [],
      receivedBatches,
    ));
    supabase.getAdmin.mockReturnValue({ from, rpc });

    const result = await createTransaction(draft, creationKey);

    expect(result).toMatchObject({ id: row.id, contactIds: ["contact-1"], sourceListing: null });
    expect(rpc).toHaveBeenCalledWith("create_transaction_with_contacts", {
      p_values: {
        address: row.address,
        centris_number: row.centris_number,
        type: row.type,
        broker: row.broker,
        price: row.price,
        promise_date: row.promise_date,
        status: row.status,
        general_notes: row.general_notes,
      },
      p_contact_ids: ["contact-1"],
      p_creation_key: creationKey,
    });
  });

  it("propage un rollback create de la RPC sans écriture ni nettoyage manuel", async () => {
    const contactError = { code: "P0001", message: "Contact lié invalide." };
    const from = vi.fn();
    supabase.getAdmin.mockReturnValue({
      from,
      rpc: vi.fn(async () => ({ data: null, error: contactError })),
    });

    await expect(createTransaction(draft)).rejects.toBe(contactError);
    expect(from).not.toHaveBeenCalled();
  });

  it("réutilise la même creation_key pour un retry et distingue deux tentatives", async () => {
    const rpc = vi.fn(async (_name: string, _values: { p_creation_key: string }) => ({ data: row, error: null }));
    supabase.getAdmin.mockReturnValue({
      rpc,
      from: vi.fn(() => tableQuery([], [])),
    });
    const firstKey = "b7fb7047-6f55-4d32-81d8-eec032de6ebb";
    const secondKey = "32e0cd24-366e-4c08-b664-b2af112911bc";

    await createTransaction({ ...draft, contactIds: [] }, firstKey);
    await createTransaction({ ...draft, contactIds: [] }, firstKey);
    await createTransaction({ ...draft, contactIds: [] }, secondKey);

    expect(rpc.mock.calls.map((call) => call[1].p_creation_key)).toEqual([
      firstKey,
      firstKey,
      secondKey,
    ]);
  });

  it("modifie atomiquement les champs et remplace les Contacts en conservant le Listing source", async () => {
    const updatedRow = { ...row, price: 525000 };
    const rpc = vi.fn(async () => ({ data: updatedRow, error: null }));
    const receivedBatches: string[][] = [];
    const from = vi.fn((table: string) => tableQuery(
      table === "transaction_contacts"
        ? [
            { transaction_id: row.id, contact_id: "contact-b" },
            { transaction_id: row.id, contact_id: "contact-c" },
          ]
        : table === "listing_transaction_links"
          ? [{
              transaction_id: row.id,
              listing_id: "listing-1",
              offer_id: "offer-1",
              listings: {
                civic_number: "1010",
                address: "Av. Laurier E.",
                apartment: "",
                city: "Montréal",
                province: "QC",
                postal_code: "H2J 1G9",
              },
            }]
          : [],
      receivedBatches,
    ));
    supabase.getAdmin.mockReturnValue({ from, rpc });

    const result = await updateTransaction(row.id, {
      price: 525000,
      contactIds: ["contact-b", "contact-c", "contact-b"],
    });

    expect(rpc).toHaveBeenCalledWith("update_transaction_with_contacts", {
      p_transaction_id: row.id,
      p_values: { price: 525000 },
      p_contact_ids: ["contact-b", "contact-c"],
    });
    expect(result).toMatchObject({
      price: 525000,
      contactIds: ["contact-b", "contact-c"],
      sourceListing: { listingId: "listing-1", offerId: "offer-1" },
    });
  });

  it("distingue NULL et tableau vide pour les Contacts lors d’un update", async () => {
    const rpc = vi.fn(async () => ({ data: row, error: null }));
    supabase.getAdmin.mockReturnValue({
      rpc,
      from: vi.fn(() => tableQuery([], [])),
    });

    await updateTransaction(row.id, { status: "negotiation" });
    await updateTransaction(row.id, { contactIds: [] });

    expect(rpc).toHaveBeenNthCalledWith(1, "update_transaction_with_contacts", expect.objectContaining({
      p_contact_ids: null,
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, "update_transaction_with_contacts", expect.objectContaining({
      p_values: {},
      p_contact_ids: [],
    }));
  });

  it("propage le refus SQL d’un update finalisé sans lecture ni écriture manuelle", async () => {
    const finalizedError = { code: "P0001", message: "Une transaction finalisée ne peut plus être modifiée." };
    const from = vi.fn();
    supabase.getAdmin.mockReturnValue({
      from,
      rpc: vi.fn(async () => ({ data: null, error: finalizedError })),
    });

    await expect(updateTransaction(row.id, { price: 525000 })).rejects.toBe(finalizedError);
    expect(from).not.toHaveBeenCalled();
  });

  it("propage le rollback update si un nouveau Contact est invalide", async () => {
    const contactError = { code: "P0001", message: "Contact lié invalide." };
    const from = vi.fn();
    supabase.getAdmin.mockReturnValue({
      from,
      rpc: vi.fn(async () => ({ data: null, error: contactError })),
    });

    await expect(updateTransaction(row.id, {
      price: 525000,
      contactIds: ["contact-invalide"],
    })).rejects.toBe(contactError);
    expect(from).not.toHaveBeenCalled();
  });

  it("finalise une vente sans Listing et conserve le statut de workflow", async () => {
    const finalizedRow: TransactionRow = {
      ...row,
      sold_price: 485000,
      notary_date: "2026-09-15",
      collaborating_broker_name: "Jean Tremblay",
      sale_finalized_at: "2026-08-22T15:00:00.000Z",
      status: "notary",
    };
    const rpc = vi.fn(async () => ({ data: finalizedRow, error: null }));
    const from = vi.fn(() => readableQuery({ data: [], error: null }));
    supabase.getAdmin.mockReturnValue({ from, rpc });

    const result = await completeTransactionSale(row.id, {
      soldPrice: 485000,
      notaryDate: "2026-09-15",
      collaboratingBrokerName: "Jean Tremblay",
      noCollaboratingBroker: false,
    });

    expect(rpc).toHaveBeenCalledWith("complete_transaction_sale", {
      p_transaction_id: row.id,
      p_sold_price: 485000,
      p_notary_date: "2026-09-15",
      p_collaborating_broker_name: "Jean Tremblay",
      p_no_collaborating_broker: false,
    });
    expect(result).toMatchObject({
      id: row.id,
      status: "notary",
      soldPrice: 485000,
      notaryDate: "2026-09-15",
      collaboratingBrokerName: "Jean Tremblay",
      saleFinalizedAt: "2026-08-22T15:00:00.000Z",
      sourceListing: null,
    });
  });

  it("finalise atomiquement un achat sans modifier son statut ni ses contacts", async () => {
    const finalizedRow: TransactionRow = {
      ...row,
      type: "purchase",
      price: 600000,
      notary_date: "2026-08-24",
      collaborating_broker_name: "Jean Tremblay",
      purchase_finalized_at: "2026-08-24T15:00:00.000Z",
      status: "notary",
    };
    const rpc = vi.fn(async () => ({ data: finalizedRow, error: null }));
    const from = vi.fn(() => readableQuery({ data: [], error: null }));
    supabase.getAdmin.mockReturnValue({ from, rpc });

    const result = await completeTransactionPurchase(row.id, {
      purchasePrice: 600000,
      notaryDate: "2026-08-24",
      collaboratingBrokerName: "Jean Tremblay",
      noCollaboratingBroker: false,
    });

    expect(rpc).toHaveBeenCalledWith("complete_transaction_purchase", {
      p_transaction_id: row.id,
      p_purchase_price: 600000,
      p_notary_date: "2026-08-24",
      p_collaborating_broker_name: "Jean Tremblay",
    });
    expect(result).toMatchObject({
      id: row.id,
      type: "purchase",
      status: "notary",
      contactIds: [],
      price: 600000,
      notaryDate: "2026-08-24",
      collaboratingBrokerName: "Jean Tremblay",
      purchaseFinalizedAt: "2026-08-24T15:00:00.000Z",
    });
    expect(from).toHaveBeenCalledWith("transaction_contacts");
  });

  it("finalise un achat sans courtier collaborateur avec une valeur vide", async () => {
    const finalizedRow: TransactionRow = {
      ...row,
      type: "purchase",
      price: 600000,
      notary_date: "2026-08-24",
      collaborating_broker_name: "",
      purchase_finalized_at: "2026-08-24T15:00:00.000Z",
      status: "notary",
    };
    const rpc = vi.fn(async () => ({ data: finalizedRow, error: null }));
    supabase.getAdmin.mockReturnValue({
      from: vi.fn(() => readableQuery({ data: [], error: null })),
      rpc,
    });

    const result = await completeTransactionPurchase(row.id, {
      purchasePrice: 600000,
      notaryDate: "2026-08-24",
      collaboratingBrokerName: "Nom ignoré",
      noCollaboratingBroker: true,
    });

    expect(rpc).toHaveBeenCalledWith("complete_transaction_purchase", expect.objectContaining({
      p_collaborating_broker_name: "",
    }));
    expect(result.collaboratingBrokerName).toBe("");
  });
});
