import type { Transaction } from "../../data/transaction-types";

export const TRANSACTION_DELETE_WARNING = "Transaction supprimée · certains événements Google Agenda n'ont pas pu être supprimés.";

export async function deleteTransactionWithCalendarCleanup(
  transaction: Pick<Transaction, "id" | "deadlines">,
  deleteCalendarEvent: (deadline: Transaction["deadlines"][number]) => Promise<void>,
  deleteRecord: (transactionId: string) => Promise<void>,
) {
  let calendarCleanupFailed = false;
  for (const deadline of transaction.deadlines) {
    if (!deadline.googleCalendarEventId) continue;
    try {
      await deleteCalendarEvent(deadline);
    } catch (error) {
      calendarCleanupFailed = true;
      console.error("Suppression d'un événement Google Agenda impossible:", error);
    }
  }
  await deleteRecord(transaction.id);
  return { warning: calendarCleanupFailed ? TRANSACTION_DELETE_WARNING : undefined };
}
