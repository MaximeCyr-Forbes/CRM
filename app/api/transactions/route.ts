import type { TransactionDraft, TransactionStatus, TransactionType } from "../../data/transaction-types";
import { statusesForTransaction } from "../../data/transaction-types";
import type { TransactionBroker } from "../../data/transaction-types";
import { requireApiAccess } from "../../lib/crm-access";
import { isSameOriginRequest } from "../../lib/google-calendar/config";
import {
  deleteCalendarEventForTransactionDeadline,
  syncTransactionDeadline,
} from "../../lib/google-calendar/service";
import {
  createTransaction,
  deleteDeadline,
  getDeadlineRow,
  getTransaction,
  insertDeadline,
  insertTransactionNote,
  listTransactions,
  updateDeadline,
  updateTransaction,
} from "../../lib/transactions/server-service";

export const dynamic = "force-dynamic";

function isBroker(value: unknown): value is TransactionBroker {
  return value === "france" || value === "maxime" || value === "sandrine";
}

function isType(value: unknown): value is TransactionType {
  return value === "purchase" || value === "sale";
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDraft(value: unknown): TransactionDraft | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.address !== "string" || !data.address.trim() ||
    !isType(data.type) || !isBroker(data.broker) ||
    !Array.isArray(data.contactIds) || !data.contactIds.every((id) => typeof id === "string") ||
    !(data.price === null || (typeof data.price === "number" && Number.isFinite(data.price))) ||
    !(data.promiseDate === null || isDate(data.promiseDate)) ||
    typeof data.status !== "string" ||
    !statusesForTransaction(data.type).includes(data.status as never) ||
    typeof data.generalNotes !== "string"
  ) return null;
  return data as TransactionDraft;
}

export async function GET() {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  try {
    return Response.json({ data: await listTransactions() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Impossible de charger les transactions." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Requête invalide." }, { status: 400 });

  try {
    if (body.action === "create") {
      const draft = parseDraft(body.draft);
      if (!draft) return Response.json({ error: "Transaction invalide." }, { status: 400 });
      return Response.json({ data: await createTransaction(draft) });
    }

    const transactionId = typeof body.transactionId === "string" ? body.transactionId : "";
    if (!transactionId) return Response.json({ error: "Transaction invalide." }, { status: 400 });

    if (body.action === "update") {
      const values = body.values && typeof body.values === "object"
        ? body.values as Record<string, unknown>
        : null;
      if (!values) return Response.json({ error: "Modification invalide." }, { status: 400 });
      const allowed: Parameters<typeof updateTransaction>[1] = {};
      if (typeof values.status === "string") {
        const existing = await getTransaction(transactionId);
        if (!statusesForTransaction(existing.type).includes(values.status as never)) {
          return Response.json({ error: "Statut invalide pour ce type de transaction." }, { status: 400 });
        }
        allowed.status = values.status as TransactionStatus;
      }
      if (typeof values.address === "string" && values.address.trim()) allowed.address = values.address;
      if (values.price === null || typeof values.price === "number") allowed.price = values.price;
      if (values.promiseDate === null || isDate(values.promiseDate)) allowed.promiseDate = values.promiseDate;
      if (typeof values.generalNotes === "string") allowed.generalNotes = values.generalNotes;
      return Response.json({ data: await updateTransaction(transactionId, allowed) });
    }

    if (body.action === "addDeadline") {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const dueDate = body.dueDate;
      const syncToGoogle = body.syncToGoogle === true;
      if (!title || !isDate(dueDate)) return Response.json({ error: "Échéance invalide." }, { status: 400 });
      const deadlineId = await insertDeadline(transactionId, title, dueDate, syncToGoogle);
      const calendar = syncToGoogle ? await syncTransactionDeadline(deadlineId) : null;
      return Response.json({ data: await getTransaction(transactionId), calendar });
    }

    if (body.action === "updateDeadline") {
      const deadlineId = typeof body.deadlineId === "string" ? body.deadlineId : "";
      if (!deadlineId) return Response.json({ error: "Échéance invalide." }, { status: 400 });
      const existing = await getDeadlineRow(deadlineId);
      if (existing.transaction_id !== transactionId) {
        return Response.json({ error: "Échéance invalide." }, { status: 400 });
      }
      await updateDeadline(transactionId, deadlineId, {
        ...(typeof body.title === "string" && body.title.trim() ? { title: body.title } : {}),
        ...(isDate(body.dueDate) ? { dueDate: body.dueDate } : {}),
        ...(typeof body.completed === "boolean" ? { completed: body.completed } : {}),
        ...(body.syncToGoogle === true ? { syncToGoogle: true } : {}),
      });
      const shouldSync = body.syncToGoogle === true || Boolean(existing.google_calendar_event_id);
      const calendar = shouldSync ? await syncTransactionDeadline(deadlineId) : null;
      return Response.json({ data: await getTransaction(transactionId), calendar });
    }

    if (body.action === "deleteDeadline") {
      const deadlineId = typeof body.deadlineId === "string" ? body.deadlineId : "";
      if (!deadlineId) return Response.json({ error: "Échéance invalide." }, { status: 400 });
      const deadline = await getDeadlineRow(deadlineId);
      if (deadline.transaction_id !== transactionId) {
        return Response.json({ error: "Échéance invalide." }, { status: 400 });
      }
      let warning: string | null = null;
      try {
        await deleteCalendarEventForTransactionDeadline(deadline);
      } catch {
        warning = "Échéance supprimée du CRM · événement Google impossible à supprimer.";
      }
      await deleteDeadline(deadlineId);
      return Response.json({ data: await getTransaction(transactionId), warning });
    }

    if (body.action === "addNote") {
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content) return Response.json({ error: "Note invalide." }, { status: 400 });
      await insertTransactionNote(transactionId, content);
      return Response.json({ data: await getTransaction(transactionId) });
    }

    return Response.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "L’opération sur la transaction a échoué." }, { status: 502 });
  }
}
