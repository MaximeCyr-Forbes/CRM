import type { TransactionDraft } from "../../data/transaction-types";

export function transactionInsertValues(draft: TransactionDraft) {
  return {
    address: draft.address.trim(),
    centris_number: draft.centrisNumber.trim(),
    type: draft.type,
    broker: draft.broker,
    price: draft.price,
    promise_date: draft.promiseDate,
    status: draft.status,
    general_notes: draft.generalNotes.trim(),
  };
}

export function transactionContactLinkRows(transactionId: string, contactIds: ReadonlyArray<string>) {
  return [...new Set(contactIds)].map((contactId) => ({
    transaction_id: transactionId,
    contact_id: contactId,
  }));
}
