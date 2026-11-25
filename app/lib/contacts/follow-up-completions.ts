import type { ContactFollowUpCompletion } from "../../data/contact-follow-up-types";
import type { CalendarBroker } from "../../data/calendar-types";
import { getSupabaseAdmin, getSupabaseServiceClient } from "../supabase/server";
import { deleteCalendarEventForContact, syncContactFollowUp } from "../google-calendar/service";

type CompletionRow = ContactFollowUpCompletion & { google_event_id: string | null; google_event_broker: CalendarBroker | null; google_calendar_id: string | null };
export const completionColumns = "id,contact_id,scheduled_for,completed_at,completed_by_member_id,completed_by_broker,reverted_at,reverted_by_member_id,reverted_by_broker,google_sync_status,google_sync_error";

export async function readFollowUpHistory(contactId: string) {
  const db = getSupabaseAdmin();
  const contact = await db.from("contacts").select("id").eq("id", contactId).single();
  if (contact.error || !contact.data) throw new Error("FOLLOWUP_FORBIDDEN");
  const { data, error } = await db.from("contact_follow_up_completions").select(completionColumns).eq("contact_id", contactId).order("completed_at", { ascending: false });
  if (error) throw error;
  return data as ContactFollowUpCompletion[];
}

/** Read via session RLS before using server credentials for these two sync-result columns only. */
export async function syncCompletedFollowUp(contactId: string, id: string) {
  const { data, error } = await getSupabaseAdmin().from("contact_follow_up_completions").select("*").eq("contact_id", contactId).eq("id", id).single();
  if (error || !data) throw new Error("FOLLOWUP_FORBIDDEN");
  const row = data as CompletionRow;
  if (row.google_sync_status === "synced") return { status: "synced" as const, message: "Suivi enregistré." };
  let status: "synced" | "error" = "synced";
  let message = "Suivi enregistré · événement de relance retiré.";
  try {
    if (row.google_event_id && (!row.google_event_broker || !row.google_calendar_id)) throw new Error("Calendrier de la relance indisponible.");
    await deleteCalendarEventForContact({ googleCalendarEventId: row.google_event_id, googleCalendarEventBroker: row.google_event_broker }, row.google_calendar_id ?? undefined);
  } catch {
    status = "error";
    message = "Suivi enregistré · retrait Google Agenda à réessayer.";
  }
  const result = await getSupabaseServiceClient().from("contact_follow_up_completions")
    .update({ google_sync_status: status, google_sync_error: status === "error" ? message : null }).eq("id", id).eq("contact_id", contactId);
  // The completion is already committed even if recording the Google outcome fails.
  if (result.error) return { status: "error" as const, message: "Suivi enregistré · vérification Google Agenda à réessayer." };
  return { status, message };
}

export async function completeContactFollowUp(contactId: string, scheduledFor: string, version: string) {
  const { data, error } = await getSupabaseAdmin().rpc("complete_contact_follow_up", { p_contact_id: contactId, p_scheduled_for: scheduledFor, p_version: version });
  if (error) throw error;
  let calendarSync;
  try { calendarSync = await syncCompletedFollowUp(contactId, data.id); }
  catch { calendarSync = { status: "error" as const, message: "Suivi enregistré · vérification Google Agenda à réessayer." }; }
  return { calendarSync, completionId: data.id };
}

export async function revertContactFollowUp(contactId: string, id: string) {
  const { data, error } = await getSupabaseAdmin().rpc("revert_contact_follow_up", { p_contact_id: contactId, p_completion_id: id });
  if (error) throw error;
  let calendarSync;
  try {
    calendarSync = await syncCompletedFollowUp(contactId, id);
    if (data.restored) calendarSync = await syncContactFollowUp(contactId);
  } catch { calendarSync = { status: "error" as const, message: "Annulation enregistrée · synchronisation Google à réessayer." }; }
  return { calendarSync, restored: data.restored };
}
