import type { CalendarBroker } from "../../data/calendar-types";
import type { GoogleConnectionRow } from "../google/connection";
import { getGoogleConnection, googleAuthenticatedRequest } from "../google/connection";
import { GMAIL_SEND_SCOPE, GMAIL_SETTINGS_BASIC_SCOPE } from "./scopes";

export { GMAIL_SEND_SCOPE, GMAIL_SETTINGS_BASIC_SCOPE } from "./scopes";

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_SEND_AS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs";
const EMAIL_PATTERN = /^[^\s@<>,;:\"()[\]\\]+@[^\s@<>,;:\"()[\]\\]+\.[^\s@<>,;:\"()[\]\\]+$/;

export class GmailNotEnabledError extends Error {}
export class GmailAuthorizationRequiredError extends Error {}
export class GmailSignatureAuthorizationRequiredError extends Error {}
export class GmailSendError extends Error {}

export type GmailMessageInput = {
  to: string;
  subject: string;
  message: string;
};

export type GmailSendAsIdentity = {
  sendAsEmail: string;
  displayName?: string;
  replyToAddress?: string;
  signature?: string;
  isPrimary?: boolean;
  isDefault?: boolean;
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

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'");
}

export function gmailSignatureHtmlToText(signature: string) {
  return decodeHtmlEntities(
    signature
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:div|p|li|tr|table|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeGmailMessageHtml(message: string) {
  return message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r\n|\r|\n/g, "<br>");
}

function formatMailbox(identity: GmailSendAsIdentity) {
  const email = identity.sendAsEmail.trim();
  if (!EMAIL_PATTERN.test(email) || /[\r\n]/.test(email)) return null;
  const displayName = identity.displayName?.replace(/[\r\n]+/g, " ").trim();
  return displayName ? `=?UTF-8?B?${utf8ToBase64(displayName)}?= <${email}>` : email;
}

export function selectGmailSendAsIdentity(
  identities: GmailSendAsIdentity[],
  googleAccountEmail: string,
) {
  const accountEmail = googleAccountEmail.trim().toLocaleLowerCase("en");
  return identities.find((identity) => identity.sendAsEmail.trim().toLocaleLowerCase("en") === accountEmail)
    ?? identities.find((identity) => identity.isDefault)
    ?? identities.find((identity) => identity.isPrimary)
    ?? null;
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

export function buildGmailRawMessage(
  input: GmailMessageInput,
  identity: GmailSendAsIdentity | null = null,
  boundary = `=_Forbes_${crypto.randomUUID().replace(/-/g, "")}`,
) {
  const { to, subject, message } = validateGmailMessage(input);
  const signatureHtml = identity?.signature?.trim() ? identity.signature : "";
  const signatureText = signatureHtml ? gmailSignatureHtmlToText(signatureHtml) : "";
  const normalizedMessage = message.replace(/\r\n|\r|\n/g, "\r\n");
  const textBody = `${normalizedMessage}${signatureText ? `\r\n\r\n${signatureText}` : ""}`;
  const htmlBody = `<div dir="ltr">${escapeGmailMessageHtml(message)}${signatureHtml ? `<br><br>${signatureHtml}` : ""}</div>`;
  const mailbox = identity ? formatMailbox(identity) : null;
  const replyTo = identity?.replyToAddress?.trim();
  const headers = [
    ...(mailbox ? [`From: ${mailbox}`] : []),
    `To: ${to}`,
    ...(replyTo && EMAIL_PATTERN.test(replyTo) && !/[\r\n]/.test(replyTo) ? [`Reply-To: ${replyTo}`] : []),
    `Subject: =?UTF-8?B?${utf8ToBase64(subject)}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const mime = [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(utf8ToBase64(textBody)),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(utf8ToBase64(htmlBody)),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return toBase64Url(mime);
}

async function loadGmailSendAsIdentity(connection: GoogleConnectionRow) {
  const response = await googleAuthenticatedRequest(connection, GMAIL_SEND_AS_URL, {});
  if (response.status === 403) {
    throw new GmailSignatureAuthorizationRequiredError("La signature Gmail doit être autorisée pour ce courtier.");
  }
  if (!response.ok) throw new GmailSendError("La signature Gmail n’a pas pu être récupérée.");
  const result = (await response.json()) as { sendAs?: GmailSendAsIdentity[] };
  return selectGmailSendAsIdentity(result.sendAs ?? [], connection.google_account_email);
}

export async function sendGmailMessage(broker: CalendarBroker, input: GmailMessageInput) {
  const connection = await getGoogleConnection(broker);
  if (!connection || !connection.scopes.includes(GMAIL_SEND_SCOPE)) {
    throw new GmailNotEnabledError("Gmail n’est pas activé pour ce courtier.");
  }
  if (!connection.scopes.includes(GMAIL_SETTINGS_BASIC_SCOPE)) {
    throw new GmailSignatureAuthorizationRequiredError("La signature Gmail doit être autorisée pour ce courtier.");
  }

  const identity = await loadGmailSendAsIdentity(connection);
  const response = await googleAuthenticatedRequest(connection, GMAIL_SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: buildGmailRawMessage(input, identity) }),
  });
  if (response.status === 403) {
    throw new GmailAuthorizationRequiredError("L’autorisation Gmail doit être renouvelée.");
  }
  if (!response.ok) throw new GmailSendError("Le courriel n’a pas pu être envoyé.");

  const result = (await response.json()) as { id?: string; threadId?: string };
  return {
    id: result.id ?? null,
    threadId: result.threadId ?? null,
    senderEmail: identity?.sendAsEmail ?? connection.google_account_email,
  };
}
