import type { TransactionDraft, TransactionStatus, TransactionType } from "../../data/transaction-types";
import { statusesForTransaction, validStatusForTransaction } from "../../data/transaction-types";
import type { TransactionBroker } from "../../data/transaction-types";
import { requireApiAccess } from "../../lib/crm-access";
import { isSameOriginRequest } from "../../lib/google-calendar/config";
import {
  deleteCalendarEventForTransactionDeadline,
  syncTransactionDeadline,
} from "../../lib/google-calendar/service";
import { deleteTransactionWithCalendarCleanup } from "../../lib/transactions/delete-workflow";
import { transactionApiErrorMessage, transactionApiErrorStatus, transactionErrorMetadata, type TransactionAction } from "../../lib/transactions/api-error";
import { isFinalizedTransaction } from "../../lib/transactions/completion";
import { parseTransactionDeadlineTimeInput } from "../../lib/transactions/deadline-time";
import { parseAgendaDeadlines } from "../../lib/transactions/oaciq-agenda";
import {
  FINALIZED_TRANSACTION_DELETE_MESSAGE,
  FINALIZED_TRANSACTION_UPDATE_MESSAGE,
  LINKED_TRANSACTION_DELETE_MESSAGE,
} from "../../lib/transactions/history-protection";
import {
  createTransaction,
  deleteDeadline,
  deleteTransaction as deleteTransactionRecord,
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

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseDraft(value: unknown): TransactionDraft | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.address !== "string" || !data.address.trim() ||
    !(data.centrisNumber === undefined || typeof data.centrisNumber === "string") ||
    !isType(data.type) || !isBroker(data.broker) ||
    !Array.isArray(data.contactIds) || !data.contactIds.every((id) => typeof id === "string") ||
    !(data.price === null || (typeof data.price === "number" && Number.isFinite(data.price))) ||
    !(data.promiseDate === null || isDate(data.promiseDate)) ||
    typeof data.status !== "string" ||
    !statusesForTransaction(data.type).includes(data.status as never) ||
    typeof data.generalNotes !== "string"
  ) return null;
  return { ...data, centrisNumber: typeof data.centrisNumber === "string" ? data.centrisNumber : "" } as TransactionDraft;
}

export async function GET() {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  try {
    return Response.json({ data: await listTransactions() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Opération transaction impossible", transactionErrorMetadata(error, "list"));
    return Response.json({ error: transactionApiErrorMessage(error, "list") }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Requête invalide." }, { status: 400 });
  const requestedAction = typeof body.action === "string" ? body.action : "other";

  try {
    if (body.action === "create") {
      const submitted = body.draft && typeof body.draft === "object"
        ? body.draft as Record<string, unknown>
        : null;
      if (!submitted || typeof submitted.address !== "string" || !submitted.address.trim()) {
        return Response.json({ error: "L’adresse de la transaction est invalide." }, { status: 400 });
      }
      if (isType(submitted.type) && typeof submitted.status === "string" && !statusesForTransaction(submitted.type).includes(submitted.status as never)) {
        return Response.json({ error: "Le statut sélectionné n’est pas accepté." }, { status: 400 });
      }
      const draft = parseDraft(body.draft);
      if (!draft) return Response.json({ error: "Transaction invalide." }, { status: 400 });
      const deadlines = parseAgendaDeadlines(submitted.deadlines ?? []);
      if (!deadlines) return Response.json({ error: "Échéances invalides : vérifiez les titres, dates, heures et sources." }, { status: 400 });
      draft.deadlines = deadlines;
      if (body.creationKey !== undefined && !isUuid(body.creationKey)) {
        return Response.json({ error: "Clé de création invalide." }, { status: 400 });
      }
      return Response.json({ data: await createTransaction(draft, body.creationKey as string | undefined) });
    }

    const transactionId = typeof body.transactionId === "string" ? body.transactionId : "";
    if (!transactionId) return Response.json({ error: "Transaction invalide." }, { status: 400 });

    if (body.action === "update") {
      const values = body.values && typeof body.values === "object"
        ? body.values as Record<string, unknown>
        : null;
      if (!values) return Response.json({ error: "Modification invalide." }, { status: 400 });
      const allowed: Parameters<typeof updateTransaction>[1] = {};
      const existing = await getTransaction(transactionId);
      if (isFinalizedTransaction(existing)) {
        return Response.json({ error: FINALIZED_TRANSACTION_UPDATE_MESSAGE }, { status: 409 });
      }
      if (values.type !== undefined && !isType(values.type)) return Response.json({ error: "Type invalide." }, { status: 400 });
      if (values.broker !== undefined && !isBroker(values.broker)) return Response.json({ error: "Courtier invalide." }, { status: 400 });
      if (values.contactIds !== undefined && (!Array.isArray(values.contactIds) || !values.contactIds.every((id) => typeof id === "string"))) {
        return Response.json({ error: "Contacts liés invalides." }, { status: 400 });
      }
      if (isType(values.type)) allowed.type = values.type;
      if (isBroker(values.broker)) allowed.broker = values.broker;
      if (Array.isArray(values.contactIds)) allowed.contactIds = [...new Set(values.contactIds as string[])];
      const nextType = allowed.type ?? existing.type;
      const requestedStatus = typeof values.status === "string"
        ? values.status as TransactionStatus
        : existing.status;
      allowed.status = validStatusForTransaction(nextType, requestedStatus);
      if (typeof values.address === "string" && values.address.trim()) allowed.address = values.address;
      if (typeof values.centrisNumber === "string") allowed.centrisNumber = values.centrisNumber;
      if (values.price === null || typeof values.price === "number") allowed.price = values.price;
      if (values.promiseDate === null || isDate(values.promiseDate)) allowed.promiseDate = values.promiseDate;
      if (typeof values.generalNotes === "string") allowed.generalNotes = values.generalNotes;
      return Response.json({ data: await updateTransaction(transactionId, allowed) });
    }

    if (body.action === "deleteTransaction") {
      const existing = await getTransaction(transactionId);
      if (isFinalizedTransaction(existing)) {
        return Response.json({ error: FINALIZED_TRANSACTION_DELETE_MESSAGE }, { status: 409 });
      }
      if (existing.sourceListing) {
        return Response.json({ error: LINKED_TRANSACTION_DELETE_MESSAGE }, { status: 409 });
      }
      const result = await deleteTransactionWithCalendarCleanup(
        existing,
        (deadline) => deleteCalendarEventForTransactionDeadline({
          google_calendar_event_id: deadline.googleCalendarEventId,
          google_calendar_event_broker: deadline.googleCalendarEventBroker,
        }),
        deleteTransactionRecord,
      );
      return Response.json({ data: { transactionId }, warning: result.warning });
    }

    if (body.action === "addDeadline") {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const dueDate = body.dueDate;
      const dueTime = parseTransactionDeadlineTimeInput(body.dueTime);
      const syncToGoogle = body.syncToGoogle === true;
      if (!title || !isDate(dueDate) || !dueTime.valid) return Response.json({ error: "Échéance invalide." }, { status: 400 });
      const deadlineId = await insertDeadline(transactionId, title, dueDate, dueTime.value ?? null, syncToGoogle);
      const calendar = syncToGoogle ? await syncTransactionDeadline(deadlineId) : null;
      return Response.json({ data: await getTransaction(transactionId), calendar });
    }

    if (body.action === "updateDeadline") {
      const deadlineId = typeof body.deadlineId === "string" ? body.deadlineId : "";
      if (!deadlineId) return Response.json({ error: "Échéance invalide." }, { status: 400 });
      const dueTime = parseTransactionDeadlineTimeInput(body.dueTime);
      if (!dueTime.valid || (body.dueDate !== undefined && !isDate(body.dueDate))) {
        return Response.json({ error: "Échéance invalide." }, { status: 400 });
      }
      const existing = await getDeadlineRow(deadlineId);
      if (existing.transaction_id !== transactionId) {
        return Response.json({ error: "Échéance invalide." }, { status: 400 });
      }
      await updateDeadline(transactionId, deadlineId, {
        ...(typeof body.title === "string" && body.title.trim() ? { title: body.title } : {}),
        ...(isDate(body.dueDate) ? { dueDate: body.dueDate } : {}),
        ...(dueTime.value !== undefined ? { dueTime: dueTime.value } : {}),
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
    const action: TransactionAction = requestedAction === "create"
      ? "create"
      : requestedAction === "update"
        ? "update"
        : requestedAction === "deleteTransaction"
          ? "delete"
          : "other";
    // A database error may contain the failing row (including private OACIQ clauses).
    // For creation and deadline writes, keep technical codes only, never the row.
    const metadata = transactionErrorMetadata(error, requestedAction);
    const privateAgendaWrite = action === "create" || requestedAction.endsWith("Deadline");
    console.error("Opération transaction impossible", privateAgendaWrite ? { action: requestedAction, code: metadata.code } : metadata);
    return Response.json({ error: transactionApiErrorMessage(error, action) }, { status: transactionApiErrorStatus(error) });
  }
}
