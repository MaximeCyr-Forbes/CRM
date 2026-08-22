import type {
  Transaction,
  TransactionSaleCompletion,
} from "../../data/transaction-types";

export type TransactionSaleCompletionErrorCode =
  | "already_finalized"
  | "invalid_completion"
  | "invalid_type"
  | "not_found";

export class TransactionSaleCompletionError extends Error {
  constructor(
    public readonly code: TransactionSaleCompletionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TransactionSaleCompletionError";
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

export function isTransactionUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseTransactionSaleCompletion(value: unknown): TransactionSaleCompletion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.soldPrice !== "number"
    || !Number.isFinite(data.soldPrice)
    || data.soldPrice <= 0
    || !validCalendarDate(data.notaryDate)
    || typeof data.collaboratingBrokerName !== "string"
    || typeof data.noCollaboratingBroker !== "boolean"
  ) return null;
  const collaboratingBrokerName = data.collaboratingBrokerName.trim();
  if (!data.noCollaboratingBroker && !collaboratingBrokerName) return null;
  if (collaboratingBrokerName.length > 240) return null;
  return {
    soldPrice: data.soldPrice,
    notaryDate: data.notaryDate,
    collaboratingBrokerName: data.noCollaboratingBroker ? "" : collaboratingBrokerName,
    noCollaboratingBroker: data.noCollaboratingBroker,
  };
}

export function canCompleteTransactionSale(
  transaction: Pick<Transaction, "saleFinalizedAt" | "status" | "type">,
) {
  return transaction.type === "sale" && transaction.saleFinalizedAt === null;
}

export function mapTransactionSaleCompletionError(error: unknown): TransactionSaleCompletionError | null {
  const technical = error && typeof error === "object"
    ? error as { message?: string; details?: string }
    : {};
  const message = `${technical.message ?? ""} ${technical.details ?? ""}`.toLocaleLowerCase("fr-CA");
  if (message.includes("transaction introuvable")) {
    return new TransactionSaleCompletionError("not_found", "Transaction introuvable.");
  }
  if (message.includes("seule une transaction de vente")) {
    return new TransactionSaleCompletionError(
      "invalid_type",
      "Seule une Transaction de vente peut être finalisée comme vendue.",
    );
  }
  if (message.includes("déjà finalisée")) {
    return new TransactionSaleCompletionError("already_finalized", "Cette vente est déjà finalisée.");
  }
  if (
    message.includes("prix vendu")
    || message.includes("date du notaire")
    || message.includes("courtier collaborateur")
  ) {
    return new TransactionSaleCompletionError(
      "invalid_completion",
      "Finalisation de la vente invalide.",
    );
  }
  return null;
}
