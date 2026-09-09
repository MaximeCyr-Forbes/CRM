import { getSupabaseAdmin } from "../supabase/server";
import { googleCalendarRequest, requireGoogleCalendarConnection } from "../google-calendar/service";
import { referralContactName, type MortgageReferral, type ReferralTransaction } from "../../data/mortgage-referral-types";
import { ReferralError, referralBroker, referralFields, referralFollowUp, referralId } from "./validation";

const transactionSelect = "id,address,centris_number,broker,transaction_contacts(contacts(id,first_name,last_name))";
const referralSelect = `id,broker,transaction_id,mortgage_advisor_name,institution_name,follow_up_at,follow_up_note,google_event_id,google_calendar_id,google_event_link,created_at,updated_at,transactions!inner(${transactionSelect})`;
type LockedReferral = MortgageReferral & { event_key: string };
function checked<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error;
  return data;
}
export async function listReferrals(broker: ReturnType<typeof referralBroker>) {
  const rows: MortgageReferral[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = checked(await getSupabaseAdmin().from("mortgage_referrals").select(referralSelect)
      .eq("broker", broker).eq("transactions.broker", broker).order("created_at", { ascending: false }).order("id").range(offset, offset + 499)) as unknown as MortgageReferral[];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
export async function searchReferralTransactions(broker: ReturnType<typeof referralBroker>, search: string) {
  const needle = search.replace(/[%_,().]/g, " ").trim().slice(0, 100);
  let query = getSupabaseAdmin().from("transactions").select(transactionSelect).eq("broker", broker);
  if (needle) query = query.or(`address.ilike.%${needle}%,centris_number.ilike.%${needle}%`);
  return checked(await query.order("created_at", { ascending: false }).limit(20)) as unknown as ReferralTransaction[];
}
export async function createReferral(body: Record<string, unknown>) {
  const broker = referralBroker(body.broker);
  const transactionId = referralId(body.transaction_id);
  const fields = referralFields(body);
  const transaction = checked(await getSupabaseAdmin().from("transactions").select("id,broker").eq("id", transactionId).maybeSingle());
  if (!transaction || transaction.broker !== broker) throw new ReferralError("La transaction n’appartient pas au courtier sélectionné.", 403);
  return checked(await getSupabaseAdmin().from("mortgage_referrals").insert({ broker, transaction_id: transactionId, ...fields }).select(referralSelect).single());
}

export function referralEventPayload(referral: MortgageReferral, at: string, note: string) {
  return {
    summary: `Suivi hypothécaire — ${referral.transactions.address}`,
    description: ["Référence hypothécaire", `Transaction : ${referral.transactions.address}`,
      `Client(s) : ${referral.transactions.transaction_contacts.flatMap(({ contacts }) => contacts ? [referralContactName(contacts)] : []).join(", ")}`,
      `Responsable hypothécaire : ${referral.mortgage_advisor_name}`, `Institution : ${referral.institution_name}`, note].filter(Boolean).join("\n"),
    start: { dateTime: at, timeZone: "America/Toronto" },
    end: { dateTime: new Date(new Date(at).getTime() + 30 * 60_000).toISOString(), timeZone: "America/Toronto" },
    extendedProperties: { private: { source: "forbes-crm", eventKind: "mortgage_referral", crmBroker: referral.broker, crmEntityKind: "transaction", crmEntityId: referral.transaction_id, mortgageReferralId: referral.id } },
  };
}

// A database lease serializes requests across Vercel instances; the deterministic
// event key also makes retrying an interrupted Google POST safe.
export async function mutateReferral(id: string, body: Record<string, unknown>, remove = false) {
  referralId(id);
  const broker = referralBroker(body.broker);
  const action = remove ? "delete" : body.action ?? "edit";
  if (!["delete", "edit", "follow-up", "remove-follow-up"].includes(String(action))) throw new ReferralError("Action invalide.");
  const fields = action === "edit" ? referralFields(body) : null;
  const followUp = action === "follow-up" ? referralFollowUp(body) : null;
  const db = getSupabaseAdmin();
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = checked(await db.from("mortgage_referrals").update({ operation_token: token, operation_until: new Date(Date.now() + 180_000).toISOString() })
    .eq("id", id).eq("broker", broker).or(`operation_until.is.null,operation_until.lt.${now}`)
    .select(`${referralSelect},event_key`).maybeSingle()) as unknown as LockedReferral | null;
  if (!row) throw new ReferralError("Référence indisponible ou opération en cours. Réessayez.", 409);
  try {
    if (row.transactions.broker !== broker) throw new ReferralError("Courtier incompatible avec la transaction.", 403);
    if (action === "delete" && row.google_event_id && body.confirm !== true) throw new ReferralError("Confirmez la suppression du suivi Google et de la référence.", 409);
    let values: Record<string, unknown> = fields ?? {};
    let rollback: (() => Promise<void>) | undefined;
    const needsGoogle = Boolean(row.google_event_id || followUp);
    if (needsGoogle) {
      const connection = await requireGoogleCalendarConnection(broker);
      const calendarId = row.google_calendar_id ?? connection.calendar_id;
      let eventId = row.google_event_id ?? `mr${row.event_key.replaceAll("-", "")}`;
      const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
      let path = `${base}/${encodeURIComponent(eventId)}`;
      const request = (url: string, method: string, payload?: unknown) => googleCalendarRequest(connection, url, { method, headers: { "Content-Type": "application/json" }, ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(25_000) });
      if (action === "delete" || action === "remove-follow-up") {
        const response = await request(path, "DELETE");
        if (!response.ok && response.status !== 404 && response.status !== 410) throw new ReferralError("Suppression Google impossible. La référence est conservée.", 502);
        values = { follow_up_at: null, follow_up_note: "", google_event_id: null, google_calendar_id: null, google_event_link: null, event_key: crypto.randomUUID() };
      } else {
        const at = followUp?.at ?? row.follow_up_at!;
        const note = followUp?.note ?? row.follow_up_note;
        const payload = referralEventPayload({ ...row, ...fields }, at, note);
        let response = row.google_event_id
          ? await request(path, "PATCH", payload)
          : await request(base, "POST", { id: eventId, ...payload });
        if (!row.google_event_id && response.status === 409) response = await request(path, "PATCH", payload);
        // Google retains tombstones after compensation deletes. Rotate the key
        // before retrying so a previously cancelled ID is never reused.
        if (!row.google_event_id && (response.status === 404 || response.status === 410)) {
          const nextKey = crypto.randomUUID();
          checked(await db.from("mortgage_referrals").update({ event_key: nextKey }).eq("id", id).eq("operation_token", token).select("id").single());
          eventId = `mr${nextKey.replaceAll("-", "")}`;
          path = `${base}/${encodeURIComponent(eventId)}`;
          response = await request(base, "POST", { id: eventId, ...payload });
        }
        if (!response.ok) throw new ReferralError("Google Agenda n’a pas enregistré le suivi. Réessayez.", 502);
        const event = await response.json() as { id: string; htmlLink?: string };
        if (event.id !== eventId) throw new ReferralError("Réponse Google invalide.", 502);
        values = { ...values, follow_up_at: at, follow_up_note: note, google_event_id: eventId, google_calendar_id: calendarId, google_event_link: event.htmlLink ?? null };
        rollback = async () => {
          const result = row.google_event_id ? await request(path, "PATCH", referralEventPayload(row, row.follow_up_at!, row.follow_up_note)) : await request(path, "DELETE");
          if (!result.ok && result.status !== 404 && result.status !== 410) throw new ReferralError("Synchronisation interrompue. Réessayez pour réconcilier le suivi.", 502);
        };
      }
    } else if (action === "remove-follow-up") {
      values = { follow_up_at: null, follow_up_note: "", google_event_id: null, google_calendar_id: null, google_event_link: null };
    }
    try {
      if (action === "delete") {
        checked(await db.from("mortgage_referrals").delete().eq("id", id).eq("operation_token", token));
        return { id };
      }
      return checked(await db.from("mortgage_referrals").update(values).eq("id", id).eq("operation_token", token).select(referralSelect).single());
    } catch (error) {
      if (rollback) await rollback();
      throw error;
    }
  } finally {
    const { error } = await db.from("mortgage_referrals").update({ operation_token: null, operation_until: null }).eq("id", id).eq("operation_token", token);
    if (error) console.error("Mortgage referral lease release failed", { code: error.code });
  }
}
