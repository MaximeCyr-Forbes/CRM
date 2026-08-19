import type {
  Transaction,
  TransactionBroker,
  TransactionDeadline,
  TransactionDraft,
  TransactionNote,
  TransactionStatus,
  TransactionType,
} from "../../data/transaction-types";
import { getSupabaseAdmin } from "../supabase/server";
import { transactionContactLinkRows, transactionInsertValues } from "./persistence";

export type TransactionRow = {
  id: string;
  address: string;
  centris_number: string;
  type: TransactionType;
  broker: TransactionBroker;
  price: number | string | null;
  promise_date: string | null;
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
): Transaction {
  return {
    id: row.id,
    address: row.address,
    centrisNumber: row.centris_number ?? "",
    type: row.type,
    broker: row.broker,
    contactIds: contactRows.filter((item) => item.transaction_id === row.id).map((item) => item.contact_id),
    price: row.price === null ? null : Number(row.price),
    promiseDate: row.promise_date,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadRelations(transactionIds?: string[]) {
  const admin = getSupabaseAdmin();
  let contactsQuery = admin.from("transaction_contacts").select("transaction_id, contact_id");
  let deadlinesQuery = admin.from("transaction_deadlines").select("*");
  let notesQuery = admin.from("transaction_notes").select("*");
  if (transactionIds) {
    contactsQuery = contactsQuery.in("transaction_id", transactionIds);
    deadlinesQuery = deadlinesQuery.in("transaction_id", transactionIds);
    notesQuery = notesQuery.in("transaction_id", transactionIds);
  }
  const [contactsResult, deadlinesResult, notesResult] = await Promise.all([
    contactsQuery,
    deadlinesQuery,
    notesQuery,
  ]);
  if (contactsResult.error) throw contactsResult.error;
  if (deadlinesResult.error) throw deadlinesResult.error;
  if (notesResult.error) throw notesResult.error;
  return {
    contactRows: (contactsResult.data ?? []) as TransactionContactRow[],
    deadlineRows: (deadlinesResult.data ?? []) as TransactionDeadlineRow[],
    noteRows: (notesResult.data ?? []) as TransactionNoteRow[],
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
  return rows.map((row) => mapTransaction(row, relations.contactRows, relations.deadlineRows, relations.noteRows));
}

export async function getTransaction(transactionId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .single();
  if (error) throw error;
  const relations = await loadRelations([transactionId]);
  return mapTransaction(data as TransactionRow, relations.contactRows, relations.deadlineRows, relations.noteRows);
}

export async function createTransaction(draft: TransactionDraft) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("transactions")
    .insert(transactionInsertValues(draft))
    .select("id")
    .single();
  if (error) throw error;
  const transactionId = (data as { id: string }).id;
  if (draft.contactIds.length > 0) {
    const { error: linksError } = await admin.from("transaction_contacts").insert(
      transactionContactLinkRows(transactionId, draft.contactIds),
    );
    if (linksError) {
      await admin.from("transactions").delete().eq("id", transactionId);
      throw linksError;
    }
  }
  return getTransaction(transactionId);
}

export async function updateTransaction(
  transactionId: string,
  values: Partial<Pick<Transaction, "status" | "address" | "centrisNumber" | "price" | "promiseDate" | "generalNotes">>,
) {
  const payload: Record<string, unknown> = {};
  if (values.status !== undefined) payload.status = values.status;
  if (values.address !== undefined) payload.address = values.address.trim();
  if (values.centrisNumber !== undefined) payload.centris_number = values.centrisNumber.trim();
  if (values.price !== undefined) payload.price = values.price;
  if (values.promiseDate !== undefined) payload.promise_date = values.promiseDate;
  if (values.generalNotes !== undefined) payload.general_notes = values.generalNotes.trim();
  const { error } = await getSupabaseAdmin().from("transactions").update(payload).eq("id", transactionId);
  if (error) throw error;
  return getTransaction(transactionId);
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
