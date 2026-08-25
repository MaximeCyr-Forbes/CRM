import type { CalendarBroker } from "../../data/calendar-types";
import { getSupabaseAdmin } from "../supabase/server";
import { getGoogleConnection, type GoogleConnectionRow } from "./connection";
import { decryptGoogleToken, encryptGoogleToken } from "../google-calendar/token-crypto";

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

export class GoogleAccountRefreshTokenMismatchError extends Error {
  constructor() {
    super(
      "Le compte Google sélectionné est différent du compte déjà connecté et Google n’a pas fourni de nouveau jeton de renouvellement. Reconnectez ce compte Google.",
    );
    this.name = "GoogleAccountRefreshTokenMismatchError";
  }
}

export function normalizeGoogleAccountEmail(email: string) {
  return email.trim().toLowerCase();
}

function googleScopes(scope: string | undefined) {
  return scope?.split(" ").filter(Boolean) ?? [];
}

function isSameGoogleAccount(
  existingConnection: GoogleConnectionRow | null,
  normalizedEmail: string,
) {
  return Boolean(
    existingConnection
    && normalizeGoogleAccountEmail(existingConnection.google_account_email) === normalizedEmail,
  );
}

export async function persistGoogleConnection(
  broker: CalendarBroker,
  tokens: GoogleTokenResponse,
) {
  const userInfoResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
  );
  if (!userInfoResponse.ok) {
    throw new Error("Impossible d’identifier le compte Google connecté.");
  }
  const userInfo = (await userInfoResponse.json()) as { email?: unknown };
  const accountEmail = typeof userInfo.email === "string" ? userInfo.email.trim() : "";
  const normalizedEmail = normalizeGoogleAccountEmail(accountEmail);
  if (!normalizedEmail || !normalizedEmail.includes("@") || /\s/.test(normalizedEmail)) {
    throw new Error("Le compte Google n’a retourné aucune adresse courriel valide.");
  }

  const existingConnection = await getGoogleConnection(broker);
  const sameAccount = isSameGoogleAccount(existingConnection, normalizedEmail);
  let refreshToken: string;
  if (tokens.refresh_token) {
    refreshToken = tokens.refresh_token;
  } else if (sameAccount && existingConnection) {
    refreshToken = await decryptGoogleToken(existingConnection.encrypted_refresh_token);
  } else if (existingConnection) {
    throw new GoogleAccountRefreshTokenMismatchError();
  } else {
    throw new Error("Google n’a retourné aucun jeton de renouvellement.");
  }

  const scopes = [...new Set([
    ...(sameAccount ? existingConnection?.scopes ?? [] : []),
    ...googleScopes(tokens.scope),
  ])];
  const [encryptedAccessToken, encryptedRefreshToken] = await Promise.all([
    encryptGoogleToken(tokens.access_token),
    encryptGoogleToken(refreshToken),
  ]);

  const { error } = await getSupabaseAdmin()
    .from("google_calendar_connections")
    .upsert({
      broker,
      google_account_email: accountEmail,
      calendar_id: "primary",
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      access_token_expires_at: new Date(
        Date.now() + tokens.expires_in * 1000,
      ).toISOString(),
      scopes,
    });
  if (error) throw error;

  return { accountEmail, sameAccount, scopes };
}
