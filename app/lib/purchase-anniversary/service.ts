import { getSupabaseAdmin } from "../supabase/server";
import { listAutomaticEmailRules } from "../automatic-emails/persistence";
import { isPurchaseAnniversary, purchaseDateLabel, type PurchaseTransaction, type PurchaseGreeting } from "./model";
import { prepareGmailSender, sendPreparedGmailMessage, GmailSendUncertainError, validateGmailMessage } from "../google-gmail/service";
import { birthdayClock, birthdaySender, renderBirthday, type BirthdayContact, } from "../birthday-greetings/model";

const columns = "id,first_name,last_name,email,broker,birth_date";
export async function purchaseRule() {
  const rules = (await listAutomaticEmailRules()).filter(rule => rule.ruleType === "purchase_anniversary");
  if (rules.length !== 1) throw new Error("Une seule règle Anniversaire d’achat doit être configurée.");
  return rules[0];
}
export async function purchaseContext(transactionId: string, id: string) {
  const db = getSupabaseAdmin();
  const [contactResult, transactionResult, link] = await Promise.all([
    db.from("contacts").select(columns).eq("id", id).single(),
    db.from("transactions").select("id,type,address,notary_date,purchase_finalized_at").eq("id", transactionId).single(),
    db.from("transaction_contacts").select("contact_id").eq("transaction_id", transactionId).eq("contact_id", id).maybeSingle(),
  ]);
  if (contactResult.error || transactionResult.error || link.error || !contactResult.data || !transactionResult.data || !link.data) throw new TypeError("Contact ou lien à la transaction introuvable.");
  const transaction = transactionResult.data as PurchaseTransaction;
  if (!isPurchaseAnniversary(transaction, birthdayClock().today)) throw new TypeError("Aucun anniversaire d’achat admissible aujourd’hui au Québec.");
  return { contact: contactResult.data as BirthdayContact, transaction };
}
export async function todayPurchaseGreetings() {
  const { data, error } = await getSupabaseAdmin().from("purchase_anniversary_greetings").select("*").eq("occurrence_date", birthdayClock().today);
  if (error) throw error;
  return (data ?? []) as PurchaseGreeting[];
}
async function finish(claim: PurchaseGreeting, values: Record<string, unknown>) {
  const { data, error } = await getSupabaseAdmin().from("purchase_anniversary_greetings").update(values)
    .eq("id", claim.id).eq("attempt_token", claim.attempt_token).select("id").single();
  if (error || !data) throw new Error("État Gmail à vérifier avant toute nouvelle tentative.");
}
export async function actOnPurchase(transactionId: string, id: string, action: "done" | "manual" | "auto", actor: string) {
  await purchaseContext(transactionId, id);
  const clock = birthdayClock();
  if (action === "auto" && (!clock.afterFive || !(await purchaseRule()).triggerConfig.purchaseAnniversaryFallbackEnabled)) return { status: "skipped" };
  const { data, error } = await getSupabaseAdmin().rpc("claim_purchase_anniversary_greeting", {
    p_transaction_id: transactionId, p_contact_id: id, p_occurrence: clock.today, p_action: action, p_actor: actor,
  });
  if (error) throw error;
  const claim = (data as PurchaseGreeting[] | null)?.[0];
  if (!claim) return { status: "already_claimed" };
  if (action === "done") return { status: "manual_done" };
  let accepted = false;
  try {
    // Re-read after claiming: neither the UI nor the scheduler supplies recipient or broker.
    const { contact, transaction } = await purchaseContext(transactionId, id);
    const rule = await purchaseRule();
    const broker = birthdaySender(contact, rule);
    if (!broker) throw new TypeError("Choisissez l’expéditeur des contacts non attribués.");
    const message = validateGmailMessage(renderBirthday(contact, rule, { purchaseDate: purchaseDateLabel(transaction.notary_date!) }));
    const sender = await prepareGmailSender(broker);
    // Last possible kill-switch read, after Gmail identity/refresh calls.
    if (action === "auto" && (!birthdayClock().afterFive || birthdayClock().today !== clock.today || !(await purchaseRule()).triggerConfig.purchaseAnniversaryFallbackEnabled)) {
      await finish(claim, { status: "failed", error_message: "Envoi arrêté par le bouton OFF ou le changement de journée." });
      return { status: "stopped" };
    }
    const { contact: latest, transaction: latestTransaction } = await purchaseContext(transactionId, id);
    if (latestTransaction.notary_date !== transaction.notary_date || latestTransaction.purchase_finalized_at !== transaction.purchase_finalized_at || latest.broker !== contact.broker || latest.email !== contact.email || latest.first_name !== contact.first_name || latest.last_name !== contact.last_name) throw new Error("Le contact a changé. Actualisez avant de réessayer.");
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
export async function todayPurchaseCandidates() {
  const transactions: PurchaseTransaction[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await getSupabaseAdmin().from("transactions").select("id,type,address,notary_date,purchase_finalized_at").eq("type", "purchase").not("purchase_finalized_at", "is", null).not("notary_date", "is", null).order("id").range(offset, offset + 999);
    if (error) throw error;
    transactions.push(...(data ?? []) as PurchaseTransaction[]);
    if ((data?.length ?? 0) < 1000) break;
  }
  const candidates: { contact: BirthdayContact; transaction: PurchaseTransaction }[] = [];
  for (const transaction of transactions.filter(t => isPurchaseAnniversary(t, birthdayClock().today))) {
    const { data, error } = await getSupabaseAdmin().from("transaction_contacts").select("contact_id").eq("transaction_id", transaction.id);
    if (error) throw error;
    for (const id of new Set((data ?? []).map(l => l.contact_id as string))) candidates.push(await purchaseContext(transaction.id, id));
  }
  return candidates;
}
export async function runPurchaseAnniversaryFallback() {
  const start = birthdayClock();
  const counts = { sent: 0, skipped: 0, failed: 0 };
  if (!start.afterFive || !(await purchaseRule()).triggerConfig.purchaseAnniversaryFallbackEnabled) return counts;
  const states = new Map((await todayPurchaseGreetings()).map(g => [`${g.transaction_id}:${g.contact_id}`, g]));
  const eligible = (await todayPurchaseCandidates()).filter(({ contact, transaction }) => {
    const state = states.get(`${transaction.id}:${contact.id}`);
    return !state || (state.status === "failed" && !state.automatic_attempted_at);
  });
  for (const { contact, transaction } of eligible.slice(0, 20)) {
    if (birthdayClock().today !== start.today || !(await purchaseRule()).triggerConfig.purchaseAnniversaryFallbackEnabled) break;
    try {
      const result = await actOnPurchase(transaction.id, contact.id, "auto", "scheduler");
      if (result.status === "auto_email_sent") counts.sent++; else counts.skipped++;
    } catch { counts.failed++; }
  }
  return counts;
}
