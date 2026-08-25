import { describe, expect, it } from "vitest";
import {
  assertTransactionHistoryMutable,
  FINALIZED_TRANSACTION_DELETE_MESSAGE,
  FINALIZED_TRANSACTION_UPDATE_MESSAGE,
  LINKED_TRANSACTION_DELETE_MESSAGE,
  TransactionHistoryProtectionError,
  transactionHistoryConflict,
} from "./history-protection";

describe("protection de l’historique des Transactions", () => {
  it("autorise une Transaction active", () => {
    expect(() => assertTransactionHistoryMutable({
      type: "sale",
      saleFinalizedAt: null,
      purchaseFinalizedAt: null,
    }, "update")).not.toThrow();
  });

  it.each([
    [{ type: "sale" as const, saleFinalizedAt: "2026-08-24T20:00:00Z", purchaseFinalizedAt: null }, "update", FINALIZED_TRANSACTION_UPDATE_MESSAGE],
    [{ type: "sale" as const, saleFinalizedAt: "2026-08-24T20:00:00Z", purchaseFinalizedAt: null }, "delete", FINALIZED_TRANSACTION_DELETE_MESSAGE],
    [{ type: "purchase" as const, saleFinalizedAt: null, purchaseFinalizedAt: "2026-08-24T20:00:00Z" }, "update", FINALIZED_TRANSACTION_UPDATE_MESSAGE],
    [{ type: "purchase" as const, saleFinalizedAt: null, purchaseFinalizedAt: "2026-08-24T20:00:00Z" }, "delete", FINALIZED_TRANSACTION_DELETE_MESSAGE],
  ] as const)("refuse les mutations structurelles finalisées", (transaction, action, message) => {
    expect(() => assertTransactionHistoryMutable(transaction, action)).toThrowError(message);
  });

  it("traduit les protections SQL en conflits métier sans détail technique", () => {
    expect(transactionHistoryConflict({ message: FINALIZED_TRANSACTION_UPDATE_MESSAGE })?.message)
      .toBe(FINALIZED_TRANSACTION_UPDATE_MESSAGE);
    expect(transactionHistoryConflict({ details: FINALIZED_TRANSACTION_DELETE_MESSAGE })?.message)
      .toBe(FINALIZED_TRANSACTION_DELETE_MESSAGE);
    expect(transactionHistoryConflict({ message: LINKED_TRANSACTION_DELETE_MESSAGE })?.message)
      .toBe(LINKED_TRANSACTION_DELETE_MESSAGE);
    expect(transactionHistoryConflict({ message: "secret postgres" })).toBeNull();
    expect(new TransactionHistoryProtectionError("delete").message).toBe(FINALIZED_TRANSACTION_DELETE_MESSAGE);
  });
});
