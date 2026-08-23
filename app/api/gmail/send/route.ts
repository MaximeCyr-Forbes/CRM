import { isCalendarBroker } from "../../../data/calendar-types";
import { requireApiAccess } from "../../../lib/crm-access";
import {
  GmailAuthorizationRequiredError,
  GmailNotEnabledError,
  GmailSendError,
  GmailSignatureAuthorizationRequiredError,
  sendGmailMessage,
} from "../../../lib/google-gmail/service";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";

export const dynamic = "force-dynamic";

type SendGmailPayload = {
  senderBroker?: unknown;
  contactId?: unknown;
  to?: unknown;
  subject?: unknown;
  message?: unknown;
};

function json(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return json("Origine refusée.", 403);

  let payload: SendGmailPayload;
  try {
    payload = (await request.json()) as SendGmailPayload;
  } catch {
    return json("Requête invalide.", 400);
  }
  if (!isCalendarBroker(payload.senderBroker)) return json("Courtier expéditeur invalide.", 400);
  if (typeof payload.contactId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.contactId)) {
    return json("Contact invalide.", 400);
  }
  if (typeof payload.to !== "string" || typeof payload.subject !== "string" || typeof payload.message !== "string") {
    return json("Champs du courriel invalides.", 400);
  }

  try {
    // TODO(auth individuelle): valider senderBroker avec l’identité authentifiée lorsqu’elle existera.
    const result = await sendGmailMessage(payload.senderBroker, {
      to: payload.to,
      subject: payload.subject,
      message: payload.message,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof TypeError) return json(error.message, 400);
    if (error instanceof GmailNotEnabledError) return json("Gmail n’est pas activé pour ce courtier.", 409);
    if (error instanceof GmailSignatureAuthorizationRequiredError) return json("La signature Gmail doit être autorisée pour ce courtier.", 409);
    if (error instanceof GmailAuthorizationRequiredError) return json("L’autorisation Gmail doit être renouvelée.", 409);
    if (error instanceof GmailSendError) return json(error.message, 502);
    console.error("Envoi Gmail impossible:", error instanceof Error ? error.message : "erreur inconnue");
    return json("Le courriel n’a pas pu être envoyé.", 502);
  }
}
