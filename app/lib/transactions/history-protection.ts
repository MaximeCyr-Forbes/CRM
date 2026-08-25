import type { Transaction } from "../../data/transaction-types";
import { isFinalizedTransaction } from "./completion";

export type TransactionHistoryAction = "update" | "delete";

export const FINALIZED_TRANSACTION_UPDATE_MESSAGE = "Une transaction finalisée ne peut plus être modifiée.";
export const FINALIZED_TRANSACTION_DELETE_MESSAGE = "Une transaction finalisée doit être conservée dans l’historique.";
export const LINKED_TRANSACTION_DELETE_MESSAGE = "Cette Transaction est liée à un Listing et doit être conservée dans l’historique.";

export class TransactionHistoryProtectionError extends Error {
  constructor(
    public readonly action: TransactionHistoryAction,
    message = action === "delete"
      ? FINALIZED_TRANSACTION_DELETE_MESSAGE
      : FINALIZED_TRANSACTION_UPDATE_MESSAGE,
  ) {
    super(message);
    this.name = "TransactionHistoryProtectionError";
  }
}

export function assertTransactionHistoryMutable(
  transaction: Pick<Transaction, "type" | "saleFinalizedAt" | "purchaseFinalizedAt">,
  action: TransactionHistoryAction,
) {
  if (isFinalizedTransaction(transaction)) {
    throw new TransactionHistoryProtectionError(action);
  }
}

export function transactionHistoryConflict(error: unknown) {
  if (error instanceof TransactionHistoryProtectionError) return error;
  const technical = error && typeof error === "object"
    ? error as { message?: string; details?: string }
    : {};
  const message = `${technical.message ?? ""} ${technical.details ?? ""}`.toLocaleLowerCase("fr-CA");
  if (message.includes("transaction finalisée doit être conservée")) {
    return new TransactionHistoryProtectionError("delete");
  }
  if (message.includes("transaction finalisée ne peut plus être modifiée")) {
    return new TransactionHistoryProtectionError("update");
  }
  if (message.includes("transaction est liée à un listing")) {
    return new TransactionHistoryProtectionError("delete", LINKED_TRANSACTION_DELETE_MESSAGE);
  }
  return null;
}
