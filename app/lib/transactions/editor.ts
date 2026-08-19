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
