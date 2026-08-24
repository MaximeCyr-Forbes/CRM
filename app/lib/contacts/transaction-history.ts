import type { Listing } from "../../data/listing-types";
import { TRANSACTION_STATUS_LABELS, type Transaction } from "../../data/transaction-types";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function timestamp(value: string | null | undefined) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(DATE_ONLY_PATTERN.test(value) ? `${value}T12:00:00Z` : value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function transactionHistoryDate(transaction: Pick<Transaction, "saleFinalizedAt" | "notaryDate" | "promiseDate" | "createdAt">) {
  return transaction.saleFinalizedAt
    ?? transaction.notaryDate
    ?? transaction.promiseDate
    ?? transaction.createdAt;
}

export function sortContactTransactions(transactions: readonly Transaction[]) {
  const unique = new Map<string, Transaction>();
  for (const transaction of transactions) {
    if (!unique.has(transaction.id)) unique.set(transaction.id, transaction);
  }
  return [...unique.values()].sort((first, second) => {
    const dateDifference = timestamp(transactionHistoryDate(second)) - timestamp(transactionHistoryDate(first));
    return dateDifference || first.id.localeCompare(second.id);
  });
}

export function completedTransactionVolume(transactions: readonly Transaction[]) {
  return transactions.reduce((total, transaction) => {
    if (transaction.status === "cancelled") return total;
    if (transaction.type === "purchase" && transaction.status === "completed") {
      return total + (transaction.price ?? 0);
    }
    if (transaction.type === "sale" && transaction.saleFinalizedAt) {
      return total + (transaction.soldPrice ?? 0);
    }
    return total;
  }, 0);
}

export function transactionHistorySummary(transactions: readonly Transaction[]) {
  const uniqueTransactions = sortContactTransactions(transactions);
  return {
    dossiers: uniqueTransactions.length,
    purchases: uniqueTransactions.filter((transaction) => transaction.type === "purchase").length,
    sales: uniqueTransactions.filter((transaction) => transaction.type === "sale").length,
    completedVolume: completedTransactionVolume(uniqueTransactions),
  };
}

function dateOnlyTimestamp(value: string) {
  if (!DATE_ONLY_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = Date.UTC(year, month - 1, day);
  const date = new Date(parsed);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? parsed
    : null;
}

export function listingToPaDays(listingDate: string | null, promiseDate: string | null) {
  if (!listingDate || !promiseDate) return null;
  const listingTimestamp = dateOnlyTimestamp(listingDate);
  const promiseTimestamp = dateOnlyTimestamp(promiseDate);
  if (listingTimestamp === null || promiseTimestamp === null || promiseTimestamp < listingTimestamp) return null;
  return Math.round((promiseTimestamp - listingTimestamp) / 86_400_000);
}

export function transactionHistoryStatusLabel(transaction: Pick<Transaction, "type" | "status" | "saleFinalizedAt">) {
  if (transaction.type === "sale" && transaction.saleFinalizedAt) return "VENDUE ✓";
  if (transaction.status === "completed") return "TERMINÉE ✓";
  if (transaction.status === "cancelled") return "ANNULÉE";
  return TRANSACTION_STATUS_LABELS[transaction.status].toLocaleUpperCase("fr-CA");
}

export function transactionSourceListing(
  transaction: Pick<Transaction, "type" | "sourceListing">,
  listingsById: ReadonlyMap<string, Listing>,
) {
  if (transaction.type !== "sale" || !transaction.sourceListing) return null;
  return listingsById.get(transaction.sourceListing.listingId) ?? null;
}

export function formatTransactionHistoryDate(value: string | null) {
  if (!value) return null;
  const dateKey = value.slice(0, 10);
  if (!DATE_ONLY_PATTERN.test(dateKey) || dateOnlyTimestamp(dateKey) === null) return null;
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${dateKey}T12:00:00Z`));
}
