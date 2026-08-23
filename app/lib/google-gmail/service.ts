import type { CalendarBroker } from "../../data/calendar-types";
import { getGoogleConnection, googleAuthenticatedRequest } from "../google/connection";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const EMAIL_PATTERN = /^[^\s@<>,;:\"()[\]\\]+@[^\s@<>,;:\"()[\]\\]+\.[^\s@<>,;:\"()[\]\\]+$/;

export class GmailNotEnabledError extends Error {}
export class GmailAuthorizationRequiredError extends Error {}
export class GmailSendError extends Error {}

export type GmailMessageInput = {
  to: string;
  subject: string;
  message: string;
};

function utf8ToBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toBase64Url(value: string) {
  return utf8ToBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function validateGmailMessage(input: GmailMessageInput): GmailMessageInput {
  if (/[\r\n]/.test(input.to) || /[\r\n]/.test(input.subject)) {
    throw new TypeError("Les retours à la ligne sont interdits dans le destinataire et l’objet.");
  }
  const to = input.to.trim();
  const subject = input.subject.trim();
  const message = input.message;
  if (!EMAIL_PATTERN.test(to) || to.length > 320) throw new TypeError("Adresse courriel invalide.");
  if (!subject || subject.length > 250) throw new TypeError("L’objet doit contenir entre 1 et 250 caractères.");
  if (!message.trim() || message.length > 100_000) throw new TypeError("Le message doit contenir entre 1 et 100 000 caractères.");
  return { to, subject, message };
}

export function buildGmailRawMessage(input: GmailMessageInput) {
  const { to, subject, message } = validateGmailMessage(input);
  const normalizedMessage = message.replace(/\r\n|\r|\n/g, "\r\n");
  const mime = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${utf8ToBase64(subject)}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizedMessage,
  ].join("\r\n");
  return toBase64Url(mime);
}

export async function sendGmailMessage(broker: CalendarBroker, input: GmailMessageInput) {
  const connection = await getGoogleConnection(broker);
  if (!connection || !connection.scopes.includes(GMAIL_SEND_SCOPE)) {
    throw new GmailNotEnabledError("Gmail n’est pas activé pour ce courtier.");
  }

  const response = await googleAuthenticatedRequest(connection, GMAIL_SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: buildGmailRawMessage(input) }),
  });
  if (response.status === 403) {
    throw new GmailAuthorizationRequiredError("L’autorisation Gmail doit être renouvelée.");
  }
  if (!response.ok) throw new GmailSendError("Le courriel n’a pas pu être envoyé.");

  const result = (await response.json()) as { id?: string; threadId?: string };
  return {
    id: result.id ?? null,
    threadId: result.threadId ?? null,
    senderEmail: connection.google_account_email,
  };
}
