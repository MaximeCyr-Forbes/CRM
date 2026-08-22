import type { Listing } from "../../data/listing-types";
import type { Transaction } from "../../data/transaction-types";
import { normalizeListingCentrisNumber } from "../listings/editor";

type SaleActionTransaction = Pick<Transaction, "status" | "type">;
type ResolvableTransaction = Pick<Transaction, "centrisNumber" | "sourceListing">;
type ResolvableListing = Pick<Listing, "centrisNumber" | "id">;

export function shouldShowListingSaleAction(transaction: SaleActionTransaction) {
  return transaction.type === "sale";
}

export function normalizeCentrisNumber(value: string) {
  return normalizeListingCentrisNumber(value);
}

export function resolveListingForSaleTransaction<TListing extends ResolvableListing>(
  transaction: ResolvableTransaction,
  listings: ReadonlyArray<TListing>,
) {
  if (transaction.sourceListing) {
    const linkedListing = listings.find(
      (listing) => listing.id === transaction.sourceListing?.listingId,
    );
    if (linkedListing) return linkedListing;
  }

  const normalizedCentris = normalizeCentrisNumber(transaction.centrisNumber);
  if (!normalizedCentris) return null;

  return listings.find(
    (listing) => normalizeCentrisNumber(listing.centrisNumber) === normalizedCentris,
  ) ?? null;
}
