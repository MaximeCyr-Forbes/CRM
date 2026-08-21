import type { Listing } from "../../data/listing-types";
import type { Transaction } from "../../data/transaction-types";

type FinalizableTransaction = Pick<Transaction, "type" | "status" | "sourceListing">;
type SourceListing = Pick<Listing, "id" | "status">;

export function canFinalizeListingSaleFromTransaction(
  transaction: FinalizableTransaction,
  sourceListing: SourceListing | null,
) {
  return transaction.type === "sale"
    && transaction.status === "completed"
    && transaction.sourceListing !== null
    && sourceListing !== null
    && sourceListing.id === transaction.sourceListing.listingId
    && sourceListing.status !== "sold";
}
