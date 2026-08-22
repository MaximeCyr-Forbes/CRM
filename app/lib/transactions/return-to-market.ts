import type { Listing } from "../../data/listing-types";
import type { Transaction } from "../../data/transaction-types";
import { isTransactionUuid } from "./sale-completion";

export type TransactionReturnToMarketResult = {
  transaction: Transaction;
  listingId: string;
  offerId: string | null;
};

export type TransactionReturnToMarketErrorCode =
  | "already_cancelled"
  | "already_finalized"
  | "invalid_type"
  | "listing_sold"
  | "no_source_listing"
  | "not_found";

export class TransactionReturnToMarketError extends Error {
  constructor(
    public readonly code: TransactionReturnToMarketErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TransactionReturnToMarketError";
  }
}

export function canReturnTransactionToMarket(
  transaction: Pick<Transaction, "saleFinalizedAt" | "sourceListing" | "status" | "type">,
  sourceListing: Pick<Listing, "id" | "status"> | null,
) {
  return transaction.type === "sale"
    && transaction.sourceListing !== null
    && sourceListing !== null
    && sourceListing.id === transaction.sourceListing.listingId
    && transaction.saleFinalizedAt === null
    && transaction.status !== "cancelled"
    && sourceListing.status !== "sold";
}

export function parseReturnToMarketRpcResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (!isTransactionUuid(data.transactionId) || !isTransactionUuid(data.listingId)) return null;
  if (data.offerId !== null && !isTransactionUuid(data.offerId)) return null;
  return {
    transactionId: data.transactionId,
    listingId: data.listingId,
    offerId: data.offerId as string | null,
  };
}

export function mapReturnToMarketError(error: unknown) {
  const technical = error && typeof error === "object"
    ? error as { message?: string; details?: string }
    : {};
  const message = `${technical.message ?? ""} ${technical.details ?? ""}`.toLocaleLowerCase("fr-CA");
  if (message.includes("transaction introuvable") || message.includes("listing introuvable")) {
    return new TransactionReturnToMarketError("not_found", "Transaction ou Listing introuvable.");
  }
  if (message.includes("ne provient pas d’un listing")) {
    return new TransactionReturnToMarketError("no_source_listing", "Cette Transaction ne provient pas d’un Listing.");
  }
  if (message.includes("seule une transaction de vente")) {
    return new TransactionReturnToMarketError("invalid_type", "Seule une Transaction de vente peut revenir sur le marché.");
  }
  if (message.includes("vente finalisée")) {
    return new TransactionReturnToMarketError("already_finalized", "Une vente finalisée ne peut pas revenir sur le marché.");
  }
  if (message.includes("listing vendu")) {
    return new TransactionReturnToMarketError("listing_sold", "Un Listing vendu ne peut pas revenir sur le marché.");
  }
  if (message.includes("déjà annulée")) {
    return new TransactionReturnToMarketError("already_cancelled", "Cette Transaction est déjà annulée.");
  }
  return null;
}
