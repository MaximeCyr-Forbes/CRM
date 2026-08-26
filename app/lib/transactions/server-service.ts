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
import { compareTransactionDeadlines, normalizeTransactionDeadlineTime } from "./deadline-time";
import { getSupabaseAdmin } from "../supabase/server";
import {
  listAllSupabaseRows,
  type SupabaseOrderedRangeQuery,
} from "../supabase/pagination";
import { transactionInsertValues, transactionUpdateValues } from "./persistence";
import {
  isOptionalListingLinksUnavailableError,
  optionalListingLinkRows,
  type DatabaseErrorMetadata,
} from "./optional-listing-links";
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
  due_time: string | null;
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

export const TRANSACTION_RELATION_BATCH_SIZE = 150;

function mapDeadline(row: TransactionDeadlineRow): TransactionDeadline {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    title: row.title,
    dueDate: row.due_date,
    dueTime: normalizeTransactionDeadlineTime(row.due_time),
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
      .sort(compareTransactionDeadlines),
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

async function loadRelations(transactionIds: ReadonlyArray<string>) {
  const admin = getSupabaseAdmin();
  const uniqueIds = [...new Set(transactionIds)];
  const contactRows: TransactionContactRow[] = [];
  const deadlineRows: TransactionDeadlineRow[] = [];
  const noteRows: TransactionNoteRow[] = [];
  const listingLinkRows: TransactionListingLinkRow[] = [];
  let listingLinksAvailable = true;

  for (let index = 0; index < uniqueIds.length; index += TRANSACTION_RELATION_BATCH_SIZE) {
    const batch = uniqueIds.slice(index, index + TRANSACTION_RELATION_BATCH_SIZE);
    const [batchContacts, batchDeadlines, batchNotes, batchListingLinks] = await Promise.all([
      listAllSupabaseRows<TransactionContactRow>({
        buildQuery: () => admin
          .from("transaction_contacts")
          .select("transaction_id, contact_id")
          .in("transaction_id", batch) as unknown as SupabaseOrderedRangeQuery<TransactionContactRow>,
        orders: [
          { column: "transaction_id", ascending: true },
          { column: "contact_id", ascending: true },
        ],
      }),
      listAllSupabaseRows<TransactionDeadlineRow>({
        buildQuery: () => admin
          .from("transaction_deadlines")
          .select("*")
          .in("transaction_id", batch) as unknown as SupabaseOrderedRangeQuery<TransactionDeadlineRow>,
        orders: [
          { column: "transaction_id", ascending: true },
          { column: "due_date", ascending: true },
          { column: "id", ascending: true },
        ],
      }),
      listAllSupabaseRows<TransactionNoteRow>({
        buildQuery: () => admin
          .from("transaction_notes")
          .select("*")
          .in("transaction_id", batch) as unknown as SupabaseOrderedRangeQuery<TransactionNoteRow>,
        orders: [
          { column: "transaction_id", ascending: true },
          { column: "created_at", ascending: false },
          { column: "id", ascending: false },
        ],
      }),
      listingLinksAvailable
        ? listAllSupabaseRows<TransactionListingLinkRow>({
            buildQuery: () => admin
              .from("listing_transaction_links")
              .select("listing_id, offer_id, transaction_id, listings(civic_number, address, apartment, city, province, postal_code)")
              .in("transaction_id", batch) as unknown as SupabaseOrderedRangeQuery<TransactionListingLinkRow>,
            orders: [
              { column: "transaction_id", ascending: true },
              { column: "listing_id", ascending: true },
            ],
          }).catch((error: DatabaseErrorMetadata) => {
            if (isOptionalListingLinksUnavailableError(error)) listingLinksAvailable = false;
            return optionalListingLinkRows<TransactionListingLinkRow>({ data: null, error });
          })
        : Promise.resolve([]),
    ]);
    contactRows.push(...batchContacts);
    deadlineRows.push(...batchDeadlines);
    noteRows.push(...batchNotes);
    listingLinkRows.push(...batchListingLinks);
  }
  return { contactRows, deadlineRows, noteRows, listingLinkRows };
}

export async function listTransactions() {
  const rows = await listAllSupabaseRows<TransactionRow>({
    buildQuery: () => getSupabaseAdmin()
      .from("transactions")
      .select("*") as unknown as SupabaseOrderedRangeQuery<TransactionRow>,
    orders: [
      { column: "updated_at", ascending: false },
      { column: "id", ascending: false },
    ],
  });
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

function rpcTransactionRow(data: unknown, message: string) {
  const row = (Array.isArray(data) ? data[0] : data) as TransactionRow | null;
  if (!row) throw new Error(message);
  return row;
}

export async function createTransaction(
  draft: TransactionDraft,
  creationKey = crypto.randomUUID(),
) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("create_transaction_with_contacts", {
    p_values: transactionInsertValues(draft),
    p_contact_ids: [...new Set(draft.contactIds)],
    p_creation_key: creationKey,
  });
  if (error) throw error;
  const row = rpcTransactionRow(data, "La Transaction créée est introuvable.");
  const relations = await loadRelations([row.id]);
  return mapTransaction(row, relations.contactRows, relations.deadlineRows, relations.noteRows, relations.listingLinkRows);
}

export async function updateTransaction(
  transactionId: string,
  values: Partial<Pick<Transaction, "status" | "address" | "centrisNumber" | "type" | "broker" | "contactIds" | "price" | "promiseDate" | "generalNotes">>,
) {
  const payload = transactionUpdateValues(values);
  const { data, error } = await getSupabaseAdmin().rpc("update_transaction_with_contacts", {
    p_transaction_id: transactionId,
    p_values: payload,
    p_contact_ids: values.contactIds === undefined ? null : [...new Set(values.contactIds)],
  });
  if (error) throw error;
  const row = rpcTransactionRow(data, "La Transaction modifiée est introuvable.");
  const relations = await loadRelations([row.id]);
  return mapTransaction(row, relations.contactRows, relations.deadlineRows, relations.noteRows, relations.listingLinkRows);
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
  dueTime: string | null,
  syncToGoogle: boolean,
) {
  const { data, error } = await getSupabaseAdmin()
    .from("transaction_deadlines")
    .insert({
      transaction_id: transactionId,
      title: title.trim(),
      due_date: dueDate,
      due_time: dueTime,
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
  values: { title?: string; dueDate?: string; dueTime?: string | null; completed?: boolean; syncToGoogle?: boolean },
) {
  const payload: Record<string, unknown> = {};
  if (values.title !== undefined) payload.title = values.title.trim();
  if (values.dueDate !== undefined) payload.due_date = values.dueDate;
  if (values.dueTime !== undefined) payload.due_time = values.dueTime;
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
