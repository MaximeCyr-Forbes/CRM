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

export function transactionUpdateValues(values: Partial<TransactionDraft>) {
  const payload: Record<string, unknown> = {};
  if (values.status !== undefined) payload.status = values.status;
  if (values.address !== undefined) payload.address = values.address.trim();
  if (values.centrisNumber !== undefined) payload.centris_number = values.centrisNumber.trim();
  if (values.type !== undefined) payload.type = values.type;
  if (values.broker !== undefined) payload.broker = values.broker;
  if (values.price !== undefined) payload.price = values.price;
  if (values.promiseDate !== undefined) payload.promise_date = values.promiseDate;
  if (values.generalNotes !== undefined) payload.general_notes = values.generalNotes.trim();
  return payload;
}

export function transactionContactLinkRows(transactionId: string, contactIds: ReadonlyArray<string>) {
  return [...new Set(contactIds)].map((contactId) => ({
    transaction_id: transactionId,
    contact_id: contactId,
  }));
}

export function transactionContactChanges(
  existingContactIds: ReadonlyArray<string>,
  nextContactIds: ReadonlyArray<string>,
) {
  const existing = new Set(existingContactIds);
  const next = new Set(nextContactIds);
  return {
    added: [...next].filter((contactId) => !existing.has(contactId)),
    removed: [...existing].filter((contactId) => !next.has(contactId)),
  };
}
