import type {
  Transaction,
  TransactionPurchaseCompletion,
} from "../../data/transaction-types";

export const FINALIZED_TRANSACTION_YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030] as const;
export type TransactionStateFilter = "active" | "sold" | "completed";

export type TransactionPurchaseCompletionErrorCode =
  | "already_finalized"
  | "cancelled"
  | "invalid_completion"
  | "invalid_type"
  | "not_found";

export class TransactionPurchaseCompletionError extends Error {
  constructor(
    public readonly code: TransactionPurchaseCompletionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TransactionPurchaseCompletionError";
  }
}

function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function parseTransactionPurchaseCompletion(value: unknown): TransactionPurchaseCompletion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.purchasePrice !== "number"
    || !Number.isFinite(data.purchasePrice)
    || data.purchasePrice <= 0
    || !validCalendarDate(data.notaryDate)
  ) return null;
  return { purchasePrice: data.purchasePrice, notaryDate: data.notaryDate };
}

export function isFinalizedTransaction(
  transaction: Pick<Transaction, "type" | "saleFinalizedAt" | "purchaseFinalizedAt">,
) {
  return transaction.type === "sale"
    ? transaction.saleFinalizedAt !== null
    : transaction.purchaseFinalizedAt !== null;
}

export function canCompleteTransactionPurchase(
  transaction: Pick<Transaction, "type" | "status" | "purchaseFinalizedAt">,
) {
  return transaction.type === "purchase"
    && transaction.purchaseFinalizedAt === null
    && transaction.status !== "cancelled";
}

export function isTransactionInState(
  transaction: Pick<Transaction, "type" | "status" | "saleFinalizedAt" | "purchaseFinalizedAt">,
  state: TransactionStateFilter,
) {
  const finalized = isFinalizedTransaction(transaction);
  if (state === "sold") return transaction.status !== "cancelled" && finalized;
  if (state === "completed") {
    return transaction.status === "cancelled" || (transaction.status === "completed" && !finalized);
  }
  return transaction.status !== "cancelled" && transaction.status !== "completed" && !finalized;
}

function finalizedMarker(transaction: Pick<Transaction, "type" | "saleFinalizedAt" | "purchaseFinalizedAt">) {
  return transaction.type === "sale" ? transaction.saleFinalizedAt : transaction.purchaseFinalizedAt;
}

export function finalizedTransactionDate(
  transaction: Pick<Transaction, "type" | "status" | "notaryDate" | "saleFinalizedAt" | "purchaseFinalizedAt">,
) {
  if (!isTransactionInState(transaction, "sold")) return null;
  return transaction.notaryDate ?? finalizedMarker(transaction);
}

export function finalizedTransactionYear(
  transaction: Pick<Transaction, "type" | "status" | "notaryDate" | "saleFinalizedAt" | "purchaseFinalizedAt">,
) {
  if (!isTransactionInState(transaction, "sold")) return null;
  const date = transaction.type === "purchase"
    ? transaction.notaryDate
    : transaction.notaryDate ?? transaction.saleFinalizedAt;
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

export function sortFinalizedTransactions(transactions: readonly Transaction[]) {
  return [...transactions].sort((first, second) => {
    const firstDate = finalizedTransactionDate(first) ?? "";
    const secondDate = finalizedTransactionDate(second) ?? "";
    return secondDate.localeCompare(firstDate) || first.id.localeCompare(second.id);
  });
}

export function finalizedTransactionLabel(transaction: Pick<Transaction, "type">) {
  return transaction.type === "sale" ? "VENDUE ✓" : "ACHAT FINALISÉ ✓";
}

export function mapTransactionPurchaseCompletionError(error: unknown): TransactionPurchaseCompletionError | null {
  const technical = error && typeof error === "object"
    ? error as { message?: string; details?: string }
    : {};
  const message = `${technical.message ?? ""} ${technical.details ?? ""}`.toLocaleLowerCase("fr-CA");
  if (message.includes("transaction introuvable")) {
    return new TransactionPurchaseCompletionError("not_found", "Transaction introuvable.");
  }
  if (message.includes("seule une transaction d’achat") || message.includes("seule une transaction d'achat")) {
    return new TransactionPurchaseCompletionError("invalid_type", "Seule une Transaction d’achat peut être finalisée.");
  }
  if (message.includes("déjà finalisé")) {
    return new TransactionPurchaseCompletionError("already_finalized", "Cet achat est déjà finalisé.");
  }
  if (message.includes("annulée")) {
    return new TransactionPurchaseCompletionError("cancelled", "Une Transaction annulée ne peut pas être finalisée.");
  }
  if (message.includes("prix d’achat") || message.includes("date du notaire")) {
    return new TransactionPurchaseCompletionError("invalid_completion", "Finalisation de l’achat invalide.");
  }
  return null;
}
