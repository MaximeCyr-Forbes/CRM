import type { Transaction } from "../../data/transaction-types";

export function replaceTransactionInState(
  transactions: ReadonlyArray<Transaction>,
  transaction: Transaction,
) {
  return [transaction, ...transactions.filter((item) => item.id !== transaction.id)];
}

export function removeTransactionFromState(
  transactions: ReadonlyArray<Transaction>,
  transactionId: string,
) {
  return transactions.filter((transaction) => transaction.id !== transactionId);
}
