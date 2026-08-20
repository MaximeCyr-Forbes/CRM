import type { Transaction, TransactionDraft } from "../../data/transaction-types";

export function transactionDraftFromTransaction(transaction: Transaction): TransactionDraft {
  return {
    address: transaction.address,
    centrisNumber: transaction.centrisNumber,
    type: transaction.type,
    broker: transaction.broker,
    contactIds: [...transaction.contactIds],
    price: transaction.price,
    promiseDate: transaction.promiseDate,
    status: transaction.status,
    generalNotes: transaction.generalNotes,
  };
}

export function normalizeTransactionCentris(value: string) {
  return value.trim().replace(/\s+/g, "").toLocaleUpperCase("fr-CA");
}

export function findTransactionsWithCentris(
  transactions: ReadonlyArray<Transaction>,
  centrisNumber: string,
) {
  const normalized = normalizeTransactionCentris(centrisNumber);
  if (!normalized) return [];
  return transactions
    .filter((transaction) => normalizeTransactionCentris(transaction.centrisNumber) === normalized)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type TransactionSaveLock = { current: boolean };

export async function runSingleTransactionSave(
  lock: TransactionSaveLock,
  save: () => Promise<void>,
) {
  if (lock.current) return false;
  lock.current = true;
  try {
    await save();
    return true;
  } finally {
    lock.current = false;
  }
}
