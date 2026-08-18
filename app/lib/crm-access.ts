import { cookies } from "next/headers";

export const CRM_ACCESS_COOKIE = "ef_crm_access";
const SESSION_PURPOSE = "equipe-forbes-crm-access:v1";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE * 1000;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function getConfiguredPassword() {
  const password = process.env.CRM_ACCESS_PASSWORD;
  if (!password) throw new Error("CRM_ACCESS_PASSWORD n’est pas configuré.");
  return password;
}

async function digest(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

export async function verifyCRMPassword(candidate: string) {
  const [candidateDigest, expectedDigest] = await Promise.all([
    digest(candidate),
    digest(getConfiguredPassword()),
  ]);
  let difference = candidateDigest.length ^ expectedDigest.length;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= candidateDigest[index] ^ expectedDigest[index];
  }
  return difference === 0;
}

async function getSessionKey(usage: KeyUsage[]) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getConfiguredPassword()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
  return key;
}

export async function createCRMAccessToken() {
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  const payload = `${SESSION_PURPOSE}:${expiresAt}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getSessionKey(["sign"]),
    new TextEncoder().encode(payload),
  );
  return `${expiresAt}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function isValidCRMAccessToken(token: string | undefined) {
  if (!token) return false;
  try {
    const [expiresAtText, signatureText] = token.split(".");
    const expiresAt = Number(expiresAtText);
    if (!signatureText || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + SESSION_MAX_AGE_MS + 60_000) return false;
    return crypto.subtle.verify(
      "HMAC",
      await getSessionKey(["verify"]),
      base64UrlToBytes(signatureText),
      new TextEncoder().encode(`${SESSION_PURPOSE}:${expiresAt}`),
    );
  } catch {
    return false;
  }
}

export async function hasCRMAccess() {
  const cookieStore = await cookies();
  return isValidCRMAccessToken(cookieStore.get(CRM_ACCESS_COOKIE)?.value);
}

export async function setCRMAccessCookie() {
  const cookieStore = await cookies();
  cookieStore.set(CRM_ACCESS_COOKIE, await createCRMAccessToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearCRMAccessCookie() {
  const cookieStore = await cookies();
  cookieStore.set(CRM_ACCESS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function requireApiAccess() {
  if (await hasCRMAccess()) return { response: null } as const;
  return {
    response: Response.json(
      { error: "Accès CRM requis." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    ),
  } as const;
}
