import type { CalendarBroker } from "../../data/calendar-types";
import { CONTACT_BROKERS } from "../../data/contact-types";
import { getGoogleOAuthConfig } from "./config";

type OAuthStatePayload = {
  broker: CalendarBroker;
  capability: GoogleOAuthCapability;
  returnTo: string;
  expiresAt: number;
  nonce: string;
};

export type GoogleOAuthCapability = "calendar" | "gmail" | "drive";

export function sanitizeOAuthReturnTo(value: unknown, fallback = "/settings") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return fallback;
  }
  return value;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getStateKey() {
  const { stateSecret } = getGoogleOAuthConfig();
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(stateSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createOAuthState(
  broker: CalendarBroker,
  capability: GoogleOAuthCapability = "calendar",
  returnTo = "/settings",
) {
  const payload: OAuthStatePayload = {
    broker,
    capability,
    returnTo: sanitizeOAuthReturnTo(returnTo),
    expiresAt: Date.now() + 10 * 60 * 1000,
    nonce: crypto.randomUUID(),
  };
  const encodedPayload = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getStateKey(),
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyOAuthState(state: string): Promise<OAuthStatePayload> {
  const [encodedPayload, encodedSignature] = state.split(".");
  if (!encodedPayload || !encodedSignature) {
    throw new Error("État OAuth invalide.");
  }

  const isValid = await crypto.subtle.verify(
    "HMAC",
    await getStateKey(),
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(encodedPayload),
  );
  if (!isValid) {
    throw new Error("Signature OAuth invalide.");
  }

  const payload = JSON.parse(
    new TextDecoder().decode(base64UrlToBytes(encodedPayload)),
  ) as OAuthStatePayload;
  if (
    !CONTACT_BROKERS.includes(payload.broker) ||
    !["calendar", "gmail", "drive"].includes(payload.capability) ||
    payload.returnTo !== sanitizeOAuthReturnTo(payload.returnTo) ||
    !Number.isFinite(payload.expiresAt) ||
    payload.expiresAt < Date.now()
  ) {
    throw new Error("État OAuth expiré ou invalide.");
  }

  return payload;
}
