import { getSupabaseAdmin } from "../supabase/server";
import { listAutomaticEmailRules } from "../automatic-emails/persistence";
import { birthdayMatchesDate } from "../dashboard/daily-notifications";
import { prepareGmailSender, sendPreparedGmailMessage, GmailSendUncertainError, validateGmailMessage } from "../google-gmail/service";
import { birthdayClock, birthdaySender, renderBirthday, type BirthdayContact, type BirthdayGreeting } from "./model";

const columns = "id,first_name,last_name,email,broker,birth_date";
export async function birthdayRule() {
  const rules = (await listAutomaticEmailRules()).filter(rule => rule.ruleType === "birthday");
  if (rules.length !== 1) throw new Error("Une seule règle Bonne fête doit être configurée.");
  return rules[0];
}
export async function birthdayContact(id: string) {
  const { data, error } = await getSupabaseAdmin().from("contacts").select(columns).eq("id", id).single();
  if (error || !data) throw new TypeError("Contact introuvable.");
  const contact = data as BirthdayContact;
  if (!birthdayMatchesDate(contact.birth_date ?? "", birthdayClock().today)) throw new TypeError("Ce contact ne fête pas son anniversaire aujourd’hui au Québec.");
  return contact;
}
export async function todayGreetings() {
  const { data, error } = await getSupabaseAdmin().from("contact_birthday_greetings").select("*").eq("occurrence_date", birthdayClock().today);
  if (error) throw error;
  return (data ?? []) as BirthdayGreeting[];
}
async function finish(claim: BirthdayGreeting, values: Record<string, unknown>) {
  const { data, error } = await getSupabaseAdmin().from("contact_birthday_greetings").update(values)
    .eq("id", claim.id).eq("attempt_token", claim.attempt_token).select("id").single();
  if (error || !data) throw new Error("État Gmail à vérifier avant toute nouvelle tentative.");
}
export async function actOnBirthday(id: string, action: "done" | "manual" | "auto", actor: string) {
  await birthdayContact(id);
  const clock = birthdayClock();
  if (action === "auto" && (!clock.afterFive || !(await birthdayRule()).triggerConfig.birthdayFallbackEnabled)) return { status: "skipped" };
  const { data, error } = await getSupabaseAdmin().rpc("claim_birthday_greeting", {
    p_contact_id: id, p_occurrence: clock.today, p_action: action, p_actor: actor,
  });
  if (error) throw error;
  const claim = (data as BirthdayGreeting[] | null)?.[0];
  if (!claim) return { status: "already_claimed" };
  if (action === "done") return { status: "manual_done" };
  let accepted = false;
  try {
    // Re-read after claiming: neither the UI nor the scheduler supplies recipient or broker.
    const contact = await birthdayContact(id);
    const rule = await birthdayRule();
    const broker = birthdaySender(contact, rule);
    if (!broker) throw new TypeError("Choisissez l’expéditeur des contacts non attribués.");
    const message = validateGmailMessage(renderBirthday(contact, rule));
    const sender = await prepareGmailSender(broker);
    // Last possible kill-switch read, after Gmail identity/refresh calls.
    if (action === "auto" && (!birthdayClock().afterFive || birthdayClock().today !== clock.today || !(await birthdayRule()).triggerConfig.birthdayFallbackEnabled)) {
      await finish(claim, { status: "failed", error_message: "Envoi arrêté par le bouton OFF ou le changement de journée." });
      return { status: "stopped" };
    }
    const latest = await birthdayContact(id);
    if (latest.broker !== contact.broker || latest.email !== contact.email || latest.first_name !== contact.first_name || latest.last_name !== contact.last_name) throw new Error("Le contact a changé. Actualisez avant de réessayer.");
    await finish(claim, { sender_broker: broker });
    const result = await sendPreparedGmailMessage(sender, message);
    accepted = true;
    const status = action === "manual" ? "manual_email_sent" : "auto_email_sent";
    await finish(claim, { status, gmail_message_id: result.id, completed_at: new Date().toISOString(), error_message: null });
    return { status };
  } catch (error) {
    const uncertain = accepted || error instanceof GmailSendUncertainError;
    const message = uncertain ? "Envoi Gmail à vérifier. Aucun nouvel envoi ne sera tenté automatiquement." : error instanceof Error ? error.message : "Envoi impossible.";
    // If persistence itself fails, the durable sending claim still prevents retries.
    await finish(claim, { status: uncertain ? "uncertain" : "failed", error_message: message }).catch(() => undefined);
    throw new Error(message);
  }
}
export async function runBirthdayFallback() {
  const start = birthdayClock();
  const counts = { sent: 0, skipped: 0, failed: 0 };
  if (!start.afterFive || !(await birthdayRule()).triggerConfig.birthdayFallbackEnabled) return counts;
  // Small sequential batch; the next schedule handles remaining contacts, never yesterday.
  const contacts: BirthdayContact[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await getSupabaseAdmin().from("contacts").select(columns).not("birth_date", "is", null).order("id").range(offset, offset + 999);
    if (error) throw error;
    contacts.push(...(data ?? []) as BirthdayContact[]);
    if ((data?.length ?? 0) < 1000) break;
  }
  const states = new Map((await todayGreetings()).map(g => [g.contact_id, g]));
  const eligible = contacts.filter(c => birthdayMatchesDate(c.birth_date ?? "", start.today) && (!states.has(c.id) || (states.get(c.id)?.status === "failed" && !states.get(c.id)?.automatic_attempted_at)));
  for (const contact of eligible.slice(0, 20)) {
    if (birthdayClock().today !== start.today || !(await birthdayRule()).triggerConfig.birthdayFallbackEnabled) break;
    try {
      const result = await actOnBirthday(contact.id, "auto", "scheduler");
      if (result.status === "auto_email_sent") counts.sent++; else counts.skipped++;
    } catch { counts.failed++; }
  }
  return counts;
}
