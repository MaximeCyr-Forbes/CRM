import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionDraft } from "../../data/transaction-types";

const supabase = vi.hoisted(() => ({ getAdmin: vi.fn() }));
vi.mock("../supabase/server", () => ({ getSupabaseAdmin: supabase.getAdmin }));

import {
  completeTransactionPurchase,
  completeTransactionSale,
  createTransaction,
  listTransactions,
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
    then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
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

  it("confirme une création normale sans requête de relecture Listing", async () => {
    const transactionTable = {
      insert: vi.fn(() => ({ select: () => ({ single: async () => ({ data: row, error: null }) }) })),
    };
    const contactTable = { insert: vi.fn(async () => ({ error: null })) };
    const from = vi.fn((table: string) => table === "transactions" ? transactionTable : contactTable);
    supabase.getAdmin.mockReturnValue({ from });

    const result = await createTransaction(draft);

    expect(result).toMatchObject({ id: row.id, contactIds: ["contact-1"], sourceListing: null });
    expect(from).not.toHaveBeenCalledWith("listing_transaction_links");
  });

  it("nettoie la transaction nouvellement insérée si les contacts liés échouent", async () => {
    const deleteEq = vi.fn(async () => ({ error: null }));
    const transactionTable = {
      insert: vi.fn(() => ({ select: () => ({ single: async () => ({ data: row, error: null }) }) })),
      delete: vi.fn(() => ({ eq: deleteEq })),
    };
    const contactError = { code: "23503", message: "contact absent" };
    const contactTable = { insert: vi.fn(async () => ({ error: contactError })) };
    supabase.getAdmin.mockReturnValue({
      from: vi.fn((table: string) => table === "transactions" ? transactionTable : contactTable),
    });

    await expect(createTransaction(draft)).rejects.toBe(contactError);
    expect(transactionTable.delete).toHaveBeenCalledOnce();
    expect(deleteEq).toHaveBeenCalledWith("id", row.id);
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
