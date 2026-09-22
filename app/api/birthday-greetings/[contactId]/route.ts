import { requireApiAccess, birthdayWorkspaceActor } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { actOnBirthday, birthdayContact, birthdayRule, todayGreetings } from "../../../lib/birthday-greetings/service";
import { birthdaySender, renderBirthday } from "../../../lib/birthday-greetings/model";
import { prepareGmailSender, validateGmailMessage } from "../../../lib/google-gmail/service";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ contactId: string }> };
export async function GET(_request: Request, context: Context) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  try {
    const { contactId } = await context.params;
    const contact = await birthdayContact(contactId);
    const state = (await todayGreetings()).find(s => s.contact_id === contactId);
    const busy = Boolean(state && state.status !== "failed");
    let broker = contact.broker === "unassigned" ? null : contact.broker;
    let reason: string | null = null;
    try {
      const rule = await birthdayRule();
      broker = birthdaySender(contact, rule);
      if (!contact.email.trim()) throw new Error("Adresse courriel manquante.");
      if (!broker) throw new Error("Choisissez l’expéditeur des contacts non attribués dans Bonne fête.");
      validateGmailMessage(renderBirthday(contact, rule));
      await prepareGmailSender(broker);
    } catch (error) { reason = error instanceof Error ? error.message : "Gmail indisponible."; }
    return Response.json({ name: `${contact.first_name} ${contact.last_name}`.trim(), broker, unassigned: contact.broker === "unassigned", canSend: !busy && !reason, canDone: !busy, reason: busy ? state?.error_message ?? "Anniversaire déjà traité ou en cours d’envoi." : reason, previousError: state?.error_message }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Anniversaire indisponible." }, { status: 400 }); }
}
export async function POST(request: Request, context: Context) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const actor = await birthdayWorkspaceActor(request);
  if (!actor) return Response.json({ error: "Espace CRM requis." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (body?.action !== "done" && body?.action !== "send") return Response.json({ error: "Action invalide." }, { status: 400 });
  try {
    const { contactId } = await context.params;
    const result = await actOnBirthday(contactId, body.action === "done" ? "done" : "manual", actor);
    return Response.json(result, { status: result.status === "already_claimed" ? 409 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Action impossible." }, { status: 502 }); }
}
