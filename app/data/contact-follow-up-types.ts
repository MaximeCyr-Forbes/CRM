export type ContactFollowUpCompletion = {
  id: string; contact_id: string; scheduled_for: string; completed_at: string;
  completed_by_member_id: string; completed_by_broker: string;
  reverted_at: string | null; reverted_by_member_id: string | null; reverted_by_broker: string | null;
  google_sync_status: "synced" | "pending" | "error"; google_sync_error: string | null;
};
export function formatFollowUpCompletionTime(value: string) {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
