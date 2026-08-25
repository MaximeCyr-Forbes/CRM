import type {
  Transaction,
  TransactionBroker,
  TransactionDeadline,
  TransactionDraft,
  TransactionNote,
  TransactionPurchaseCompletion,
  TransactionSaleCompletion,
  TransactionStatus,
  TransactionType,
} from "../../data/transaction-types";
import { getSupabaseAdmin } from "../supabase/server";
import { transactionContactChanges, transactionContactLinkRows, transactionInsertValues, transactionUpdateValues } from "./persistence";
import { optionalListingLinkRows } from "./optional-listing-links";
import {
  mapTransactionSaleCompletionError,
  parseTransactionSaleCompletion,
  TransactionSaleCompletionError,
} from "./sale-completion";
import {
  mapTransactionPurchaseCompletionError,
  parseTransactionPurchaseCompletion,
  TransactionPurchaseCompletionError,
} from "./completion";
import {
  mapReturnToMarketError,
  parseReturnToMarketRpcResult,
  TransactionReturnToMarketError,
  type TransactionReturnToMarketResult,
} from "./return-to-market";
import {
  assertTransactionHistoryMutable,
  LINKED_TRANSACTION_DELETE_MESSAGE,
  TransactionHistoryProtectionError,
} from "./history-protection";

export type TransactionRow = {
  id: string;
  address: string;
  centris_number: string;
  type: TransactionType;
  broker: TransactionBroker;
  price: number | string | null;
  sold_price: number | string | null;
  promise_date: string | null;
  notary_date: string | null;
  collaborating_broker_name: string;
  sale_finalized_at: string | null;
  purchase_finalized_at: string | null;
  status: TransactionStatus;
  general_notes: string;
  created_at: string;
  updated_at: string;
};

export type TransactionDeadlineRow = {
  id: string;
  transaction_id: string;
  title: string;
  due_date: string;
  completed: boolean;
  google_calendar_event_id: string | null;
  google_calendar_event_broker: TransactionBroker | null;
  google_calendar_sync_status: TransactionDeadline["googleCalendarSyncStatus"];
  google_calendar_last_error: string | null;
  created_at: string;
  updated_at: string;
};

type TransactionContactRow = { transaction_id: string; contact_id: string };
type TransactionListingLinkRow = {
  listing_id: string;
  offer_id: string;
  transaction_id: string;
  listings: {
    civic_number: string;
    address: string;
    apartment: string;
    city: string;
    province: string;
    postal_code: string;
  } | null;
};
type TransactionNoteRow = {
  id: string;
  transaction_id: string;
  content: string;
  created_at: string;
};

function mapDeadline(row: TransactionDeadlineRow): TransactionDeadline {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    title: row.title,
    dueDate: row.due_date,
    completed: row.completed,
    googleCalendarEventId: row.google_calendar_event_id,
    googleCalendarEventBroker: row.google_calendar_event_broker,
    googleCalendarSyncStatus: row.google_calendar_sync_status,
    googleCalendarLastError: row.google_calendar_last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNote(row: TransactionNoteRow): TransactionNote {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    content: row.content,
    createdAt: row.created_at,
  };
}

export function mapTransaction(
  row: TransactionRow,
  contactRows: TransactionContactRow[],
  deadlineRows: TransactionDeadlineRow[],
  noteRows: TransactionNoteRow[],
  listingLinkRows: TransactionListingLinkRow[] = [],
): Transaction {
  const source = listingLinkRows.find((item) => item.transaction_id === row.id);
  const listing = source?.listings;
  const sourceStreet = listing
    ? [listing.civic_number, listing.address].filter(Boolean).join(" ")
    : "";
  const sourceLocality = listing
    ? [listing.city, [listing.province, listing.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : "";
  return {
    id: row.id,
    address: row.address,
    centrisNumber: row.centris_number ?? "",
    type: row.type,
    broker: row.broker,
    contactIds: contactRows.filter((item) => item.transaction_id === row.id).map((item) => item.contact_id),
    price: row.price === null ? null : Number(row.price),
    soldPrice: row.sold_price == null ? null : Number(row.sold_price),
    promiseDate: row.promise_date,
    notaryDate: row.notary_date ?? null,
    collaboratingBrokerName: row.collaborating_broker_name ?? "",
    saleFinalizedAt: row.sale_finalized_at ?? null,
    purchaseFinalizedAt: row.purchase_finalized_at ?? null,
    status: row.status,
    generalNotes: row.general_notes,
    deadlines: deadlineRows
      .filter((item) => item.transaction_id === row.id)
      .map(mapDeadline)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    notes: noteRows
      .filter((item) => item.transaction_id === row.id)
      .map(mapNote)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    sourceListing: source ? {
      listingId: source.listing_id,
      offerId: source.offer_id,
      address: [sourceStreet, listing?.apartment ? `app. ${listing.apartment}` : "", sourceLocality].filter(Boolean).join(", "),
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadRelations(transactionIds?: string[]) {
  const admin = getSupabaseAdmin();
  let contactsQuery = admin.from("transaction_contacts").select("transaction_id, contact_id");
  let deadlinesQuery = admin.from("transaction_deadlines").select("*");
  let notesQuery = admin.from("transaction_notes").select("*");
  let listingLinksQuery = admin.from("listing_transaction_links").select("listing_id, offer_id, transaction_id, listings(civic_number, address, apartment, city, province, postal_code)");
  if (transactionIds) {
    contactsQuery = contactsQuery.in("transaction_id", transactionIds);
    deadlinesQuery = deadlinesQuery.in("transaction_id", transactionIds);
    notesQuery = notesQuery.in("transaction_id", transactionIds);
    listingLinksQuery = listingLinksQuery.in("transaction_id", transactionIds);
  }
  const [contactsResult, deadlinesResult, notesResult, listingLinksResult] = await Promise.all([
    contactsQuery,
    deadlinesQuery,
    notesQuery,
    listingLinksQuery,
  ]);
  if (contactsResult.error) throw contactsResult.error;
  if (deadlinesResult.error) throw deadlinesResult.error;
  if (notesResult.error) throw notesResult.error;
  const listingLinkRows = optionalListingLinkRows(listingLinksResult);
  return {
    contactRows: (contactsResult.data ?? []) as TransactionContactRow[],
    deadlineRows: (deadlinesResult.data ?? []) as TransactionDeadlineRow[],
    noteRows: (notesResult.data ?? []) as TransactionNoteRow[],
    listingLinkRows: listingLinkRows as unknown as TransactionListingLinkRow[],
  };
}

export async function listTransactions() {
  const { data, error } = await getSupabaseAdmin()
    .from("transactions")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as TransactionRow[];
  if (rows.length === 0) return [];
  const relations = await loadRelations(rows.map((row) => row.id));
  return rows.map((row) => mapTransaction(row, relations.contactRows, relations.deadlineRows, relations.noteRows, relations.listingLinkRows));
}

export async function getTransaction(transactionId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .single();
  if (error) throw error;
  const relations = await loadRelations([transactionId]);
  return mapTransaction(data as TransactionRow, relations.contactRows, relations.deadlineRows, relations.noteRows, relations.listingLinkRows);
}

export async function createTransaction(draft: TransactionDraft) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("transactions")
    .insert(transactionInsertValues(draft))
    .select("*")
    .single();
  if (error) throw error;
  const row = data as TransactionRow;
  const transactionId = row.id;
  if (draft.contactIds.length > 0) {
    const { error: linksError } = await admin.from("transaction_contacts").insert(
      transactionContactLinkRows(transactionId, draft.contactIds),
    );
    if (linksError) {
      const { error: cleanupError } = await admin.from("transactions").delete().eq("id", transactionId);
      if (cleanupError) {
        console.error("Nettoyage de la transaction partielle impossible", {
          action: "create-cleanup",
          code: cleanupError.code,
          message: cleanupError.message,
        });
      }
      throw linksError;
    }
  }
  return mapTransaction(
    row,
    transactionContactLinkRows(transactionId, draft.contactIds),
    [],
    [],
    [],
  );
}

export async function updateTransaction(
  transactionId: string,
  values: Partial<Pick<Transaction, "status" | "address" | "centrisNumber" | "type" | "broker" | "contactIds" | "price" | "promiseDate" | "generalNotes">>,
) {
  const admin = getSupabaseAdmin();
  const { data: historyState, error: historyError } = await admin
    .from("transactions")
    .select("type, sale_finalized_at, purchase_finalized_at")
    .eq("id", transactionId)
    .maybeSingle();
  if (historyError) throw historyError;
  if (historyState) {
    assertTransactionHistoryMutable({
      type: historyState.type as TransactionType,
      saleFinalizedAt: historyState.sale_finalized_at as string | null,
      purchaseFinalizedAt: historyState.purchase_finalized_at as string | null,
    }, "update");
  }
  const payload = transactionUpdateValues(values);
  if (Object.keys(payload).length > 0) {
    const { error } = await admin.from("transactions").update(payload).eq("id", transactionId);
    if (error) throw error;
  }
  if (values.contactIds !== undefined) {
    const { data, error } = await admin
      .from("transaction_contacts")
      .select("contact_id")
      .eq("transaction_id", transactionId);
    if (error) throw error;
    const existingContactIds = (data ?? []).map((row: { contact_id: string }) => row.contact_id);
    const changes = transactionContactChanges(existingContactIds, values.contactIds);
    if (changes.removed.length > 0) {
      const { error: removeError } = await admin
        .from("transaction_contacts")
        .delete()
        .eq("transaction_id", transactionId)
        .in("contact_id", changes.removed);
      if (removeError) throw removeError;
    }
    if (changes.added.length > 0) {
      const { error: addError } = await admin
        .from("transaction_contacts")
        .insert(transactionContactLinkRows(transactionId, changes.added));
      if (addError) throw addError;
    }
  }
  return getTransaction(transactionId);
}

export async function completeTransactionSale(
  transactionId: string,
  input: TransactionSaleCompletion,
) {
  const values = parseTransactionSaleCompletion(input);
  if (!values) {
    throw new TransactionSaleCompletionError(
      "invalid_completion",
      "Finalisation de la vente invalide.",
    );
  }
  const { data, error } = await getSupabaseAdmin().rpc("complete_transaction_sale", {
    p_transaction_id: transactionId,
    p_sold_price: values.soldPrice,
    p_notary_date: values.notaryDate,
    p_collaborating_broker_name: values.collaboratingBrokerName,
    p_no_collaborating_broker: values.noCollaboratingBroker,
  });
  if (error) {
    const transactionError = mapTransactionSaleCompletionError(error);
    if (transactionError) throw transactionError;
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as TransactionRow | null;
  if (!row) {
    throw new TransactionSaleCompletionError("not_found", "Transaction introuvable.");
  }
  const relations = await loadRelations([transactionId]);
  return mapTransaction(
    row,
    relations.contactRows,
    relations.deadlineRows,
    relations.noteRows,
    relations.listingLinkRows,
  );
}

export async function completeTransactionPurchase(
  transactionId: string,
  input: TransactionPurchaseCompletion,
) {
  const values = parseTransactionPurchaseCompletion(input);
  if (!values) {
    throw new TransactionPurchaseCompletionError(
      "invalid_completion",
      "Finalisation de l’achat invalide.",
    );
  }
  const { data, error } = await getSupabaseAdmin().rpc("complete_transaction_purchase", {
    p_transaction_id: transactionId,
    p_purchase_price: values.purchasePrice,
    p_notary_date: values.notaryDate,
    p_collaborating_broker_name: values.collaboratingBrokerName,
  });
  if (error) {
    const transactionError = mapTransactionPurchaseCompletionError(error);
    if (transactionError) throw transactionError;
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as TransactionRow | null;
  if (!row) {
    throw new TransactionPurchaseCompletionError("not_found", "Transaction introuvable.");
  }
  const relations = await loadRelations([transactionId]);
  return mapTransaction(
    row,
    relations.contactRows,
    relations.deadlineRows,
    relations.noteRows,
    relations.listingLinkRows,
  );
}

export async function returnListingTransactionToMarket(
  transactionId: string,
  actorBroker: TransactionBroker | null,
): Promise<TransactionReturnToMarketResult> {
  const { data, error } = await getSupabaseAdmin().rpc("return_listing_transaction_to_market", {
    p_transaction_id: transactionId,
    p_actor_broker: actorBroker,
  });
  if (error) {
    const transactionError = mapReturnToMarketError(error);
    if (transactionError) throw transactionError;
    throw error;
  }
  const result = parseReturnToMarketRpcResult(data);
  if (!result) {
    throw new TransactionReturnToMarketError(
      "not_found",
      "Le résultat du retour sur le marché est introuvable.",
    );
  }
  return {
    transaction: await getTransaction(result.transactionId),
    listingId: result.listingId,
    offerId: result.offerId,
  };
}

export async function deleteTransaction(transactionId: string) {
  const admin = getSupabaseAdmin();
  const { data: historyState, error: historyError } = await admin
    .from("transactions")
    .select("type, sale_finalized_at, purchase_finalized_at")
    .eq("id", transactionId)
    .maybeSingle();
  if (historyError) throw historyError;
  if (historyState) {
    assertTransactionHistoryMutable({
      type: historyState.type as TransactionType,
      saleFinalizedAt: historyState.sale_finalized_at as string | null,
      purchaseFinalizedAt: historyState.purchase_finalized_at as string | null,
    }, "delete");
  }
  const { count: linkCount, error: linkError } = await admin
    .from("listing_transaction_links")
    .select("transaction_id", { count: "exact", head: true })
    .eq("transaction_id", transactionId);
  if (linkError) throw linkError;
  if ((linkCount ?? 0) > 0) {
    throw new TransactionHistoryProtectionError("delete", LINKED_TRANSACTION_DELETE_MESSAGE);
  }
  const { error } = await admin.from("transactions").delete().eq("id", transactionId);
  if (error) throw error;
}

export async function insertDeadline(
  transactionId: string,
  title: string,
  dueDate: string,
  syncToGoogle: boolean,
) {
  const { data, error } = await getSupabaseAdmin()
    .from("transaction_deadlines")
    .insert({
      transaction_id: transactionId,
      title: title.trim(),
      due_date: dueDate,
      google_calendar_sync_status: syncToGoogle ? "pending" : "synced",
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateDeadline(
  transactionId: string,
  deadlineId: string,
  values: { title?: string; dueDate?: string; completed?: boolean; syncToGoogle?: boolean },
) {
  const payload: Record<string, unknown> = {};
  if (values.title !== undefined) payload.title = values.title.trim();
  if (values.dueDate !== undefined) payload.due_date = values.dueDate;
  if (values.completed !== undefined) payload.completed = values.completed;
  if (values.syncToGoogle) payload.google_calendar_sync_status = "pending";
  const { error } = await getSupabaseAdmin()
    .from("transaction_deadlines")
    .update(payload)
    .eq("transaction_id", transactionId)
    .eq("id", deadlineId);
  if (error) throw error;
}

export async function getDeadlineRow(deadlineId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("transaction_deadlines")
    .select("*")
    .eq("id", deadlineId)
    .single();
  if (error) throw error;
  return data as TransactionDeadlineRow;
}

export async function deleteDeadline(deadlineId: string) {
  const { error } = await getSupabaseAdmin().from("transaction_deadlines").delete().eq("id", deadlineId);
  if (error) throw error;
}

export async function insertTransactionNote(transactionId: string, content: string) {
  const { error } = await getSupabaseAdmin()
    .from("transaction_notes")
    .insert({ transaction_id: transactionId, content: content.trim() });
  if (error) throw error;
}
