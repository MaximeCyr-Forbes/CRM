import { describe, expect, it } from "vitest";
import type { Transaction } from "../../data/transaction-types";
import {
  FINALIZED_TRANSACTION_YEARS,
  canCompleteTransactionPurchase,
  finalizedTransactionLabel,
  finalizedTransactionYear,
  isFinalizedTransaction,
  isTransactionInState,
  mapTransactionPurchaseCompletionError,
  parseTransactionPurchaseCompletion,
  sortFinalizedTransactions,
} from "./completion";

function transaction(values: Partial<Transaction> = {}): Transaction {
  return {
    id: crypto.randomUUID(), address: "1403 Rue de Normandie", centrisNumber: "12345678", type: "purchase", broker: "maxime",
    contactIds: ["olivier", "honorine"], price: 600_000, soldPrice: null, promiseDate: "2026-08-12", notaryDate: null,
    collaboratingBrokerName: "", saleFinalizedAt: null, purchaseFinalizedAt: null, status: "notary", generalNotes: "",
    deadlines: [], notes: [], sourceListing: null, createdAt: "2026-08-01T14:00:00Z", updatedAt: "2026-08-01T14:00:00Z",
    ...values,
  };
}

describe("finalisation des achats", () => {
  it("valide le prix et la date du notaire", () => {
    expect(parseTransactionPurchaseCompletion({ purchasePrice: 600_000, notaryDate: "2026-08-24" }))
      .toEqual({ purchasePrice: 600_000, notaryDate: "2026-08-24" });
    expect(parseTransactionPurchaseCompletion({ purchasePrice: 0, notaryDate: "2026-08-24" })).toBeNull();
    expect(parseTransactionPurchaseCompletion({ purchasePrice: 600_000, notaryDate: "2026-02-30" })).toBeNull();
  });

  it("affiche l’action pour un achat actif ou legacy completed, jamais pour une annulation ou un achat finalisé", () => {
    expect(canCompleteTransactionPurchase(transaction())).toBe(true);
    expect(canCompleteTransactionPurchase(transaction({ status: "completed" }))).toBe(true);
    expect(canCompleteTransactionPurchase(transaction({ status: "cancelled" }))).toBe(false);
    expect(canCompleteTransactionPurchase(transaction({ purchaseFinalizedAt: "2026-08-24T14:00:00Z" }))).toBe(false);
    expect(canCompleteTransactionPurchase(transaction({ type: "sale" }))).toBe(false);
  });

  it("utilise exclusivement les marqueurs de finalisation selon le type", () => {
    expect(isFinalizedTransaction(transaction({ status: "completed" }))).toBe(false);
    expect(isFinalizedTransaction(transaction({ purchaseFinalizedAt: "2026-08-24T14:00:00Z" }))).toBe(true);
    expect(isFinalizedTransaction(transaction({ type: "sale", saleFinalizedAt: "2026-08-24T14:00:00Z" }))).toBe(true);
  });
});

describe("catégories Transactions", () => {
  it("sépare Actives, Vendus et Terminées sans chevauchement", () => {
    const active = transaction();
    const purchaseSold = transaction({ purchaseFinalizedAt: "2026-08-24T14:00:00Z", notaryDate: "2026-08-24" });
    const legacy = transaction({ status: "completed" });
    const cancelled = transaction({ status: "cancelled" });
    expect(isTransactionInState(active, "active")).toBe(true);
    expect(isTransactionInState(purchaseSold, "sold")).toBe(true);
    expect(isTransactionInState(purchaseSold, "active")).toBe(false);
    expect(isTransactionInState(purchaseSold, "completed")).toBe(false);
    expect(isTransactionInState(legacy, "completed")).toBe(true);
    expect(isTransactionInState(legacy, "sold")).toBe(false);
    expect(isTransactionInState(cancelled, "completed")).toBe(true);
    expect(isTransactionInState(cancelled, "sold")).toBe(false);
  });

  it("classe les années 2020 à 2030 selon le notaire avec fallback de vente", () => {
    const purchase = transaction({ purchaseFinalizedAt: "2024-12-16T14:00:00Z", notaryDate: "2024-12-15" });
    const sale = transaction({ type: "sale", saleFinalizedAt: "2027-01-04T14:00:00Z", notaryDate: "2027-01-03" });
    const fallbackSale = transaction({ type: "sale", saleFinalizedAt: "2025-06-10T14:00:00Z", notaryDate: null });
    expect(FINALIZED_TRANSACTION_YEARS).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]);
    expect(finalizedTransactionYear(purchase)).toBe(2024);
    expect(finalizedTransactionYear(sale)).toBe(2027);
    expect(finalizedTransactionYear(fallbackSale)).toBe(2025);
    expect(finalizedTransactionYear(transaction({ purchaseFinalizedAt: "2024-12-16T14:00:00Z", notaryDate: null }))).toBeNull();
    expect(sortFinalizedTransactions([purchase, sale, fallbackSale]).map((item) => item.id))
      .toEqual([sale.id, fallbackSale.id, purchase.id]);
  });

  it("affiche les badges finaux distincts", () => {
    expect(finalizedTransactionLabel(transaction())).toBe("ACHAT FINALISÉ ✓");
    expect(finalizedTransactionLabel(transaction({ type: "sale" }))).toBe("VENDUE ✓");
  });

  it("combine année, type et courtier dans Vendus", () => {
    const transactions = [
      transaction({ broker: "maxime", purchaseFinalizedAt: "2026-08-24T14:00:00Z", notaryDate: "2026-08-24" }),
      transaction({ broker: "france", purchaseFinalizedAt: "2026-08-24T14:00:00Z", notaryDate: "2026-08-24" }),
      transaction({ broker: "maxime", purchaseFinalizedAt: "2025-08-24T14:00:00Z", notaryDate: "2025-08-24" }),
      transaction({ broker: "maxime", type: "sale", saleFinalizedAt: "2026-08-24T14:00:00Z", notaryDate: "2026-08-24" }),
    ];
    const filtered = transactions.filter((item) => isTransactionInState(item, "sold")
      && finalizedTransactionYear(item) === 2026
      && item.type === "purchase"
      && item.broker === "maxime");
    expect(filtered).toHaveLength(1);
  });

  it("traduit les erreurs RPC sans exposer leur détail technique", () => {
    expect(mapTransactionPurchaseCompletionError({ message: "Cet achat est déjà finalisé." })?.message).toBe("Cet achat est déjà finalisé.");
    expect(mapTransactionPurchaseCompletionError({ message: "Une Transaction annulée ne peut pas être finalisée." })?.code).toBe("cancelled");
    expect(mapTransactionPurchaseCompletionError({ message: "Seule une Transaction d'achat peut être finalisée." })?.code).toBe("invalid_type");
    expect(mapTransactionPurchaseCompletionError({ message: "secret SQL" })).toBeNull();
  });
});
