import { createSign } from "node:crypto";

export const GOOGLE_DRIVE_SERVICE_ACCOUNT_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

const googleTokenEndpoint = "https://oauth2.googleapis.com/token";
const jwtLifetimeSeconds = 3_600;
const tokenSafetyWindowMs = 60_000;

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

let cachedToken: CachedToken | null = null;

export class GoogleDriveServiceAccountConfigurationError extends Error {
  constructor() {
    super("Le compte de service Google Drive n’est pas configuré sur le serveur.");
    this.name = "GoogleDriveServiceAccountConfigurationError";
  }
}

export class GoogleDriveServiceAccountAuthenticationError extends Error {
  constructor() {
    super("Le compte de service Google Drive ne peut pas s’authentifier.");
    this.name = "GoogleDriveServiceAccountAuthenticationError";
  }
}

function requireServiceAccountConfiguration() {
  const email = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY
    ?.replace(/\\n/g, "\n")
    .trim();
  if (!email || !privateKey) throw new GoogleDriveServiceAccountConfigurationError();
  return { email, privateKey };
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function createServiceAccountAssertion(email: string, privateKey: string, nowSeconds: number) {
  const unsigned = `${encodeJson({ alg: "RS256", typ: "JWT" })}.${encodeJson({
    iss: email,
    scope: GOOGLE_DRIVE_SERVICE_ACCOUNT_SCOPE,
    aud: googleTokenEndpoint,
    iat: nowSeconds,
    exp: nowSeconds + jwtLifetimeSeconds,
  })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey).toString("base64url")}`;
}

export function getGoogleDriveServiceAccountEmail() {
  return requireServiceAccountConfiguration().email;
}

async function requestServiceAccountToken() {
  const { email, privateKey } = requireServiceAccountConfiguration();
  const assertion = createServiceAccountAssertion(email, privateKey, Math.floor(Date.now() / 1_000));
  const response = await fetch(googleTokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new GoogleDriveServiceAccountAuthenticationError();
  const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== "string" || !payload.access_token) {
    throw new GoogleDriveServiceAccountAuthenticationError();
  }
  const expiresIn = typeof payload.expires_in === "number" && payload.expires_in > 0
    ? payload.expires_in
    : jwtLifetimeSeconds;
  cachedToken = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + expiresIn * 1_000,
  };
  return cachedToken.accessToken;
}

async function getServiceAccountAccessToken(forceRefresh = false) {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt - tokenSafetyWindowMs > Date.now()) {
    return cachedToken.accessToken;
  }
  return requestServiceAccountToken();
}

export async function serviceAccountGoogleDriveRequest(
  url: string,
  init: RequestInit = {},
) {
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    throw new Error("Le compte de service Google Drive est strictement en lecture seule.");
  }

  const send = async (forceRefresh = false) => fetch(url, {
    ...init,
    method,
    headers: {
      ...Object.fromEntries(new Headers(init.headers).entries()),
      Authorization: `Bearer ${await getServiceAccountAccessToken(forceRefresh)}`,
    },
    cache: "no-store",
  });

  const response = await send();
  if (response.status !== 401) return response;
  cachedToken = null;
  return send(true);
}

export function resetGoogleDriveServiceAccountTokenCacheForTests() {
  cachedToken = null;
}
