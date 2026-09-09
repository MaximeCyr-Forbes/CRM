import { calendarDateTimeISO } from "../google-calendar/calendar-date";
import { currentTorontoDateTime } from "../transactions/deadline-time";
export class ReferralError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function referralBroker(value: unknown) {
  if (value !== "maxime" && value !== "france" && value !== "sandrine") throw new ReferralError("Sélectionnez un courtier.");
  return value;
}
export function referralId(value: unknown) {
  if (typeof value !== "string" || !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)) throw new ReferralError("Identifiant invalide.");
  return value;
}
export function referralFields(body: Record<string, unknown>) {
  const text = (value: unknown) => {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 200) throw new ReferralError("Responsable et institution requis (200 caractères maximum).");
    return value.trim();
  };
  return { mortgage_advisor_name: text(body.mortgage_advisor_name), institution_name: text(body.institution_name) };
}
export function referralFollowUp(body: Record<string, unknown>) {
  if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)
    || typeof body.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)) throw new ReferralError("Date et heure invalides.");
  let at: string;
  try { at = calendarDateTimeISO(body.date, body.time); } catch { throw new ReferralError("Date invalide."); }
  const roundTrip = currentTorontoDateTime(new Date(at));
  if (roundTrip.date !== body.date || roundTrip.time !== body.time) throw new ReferralError("Cette date ou heure n’existe pas dans le fuseau de Toronto.");
  if (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 1000)) throw new ReferralError("Note invalide (1 000 caractères maximum).");
  return { at, note: typeof body.note === "string" ? body.note.trim() : "" };
}
