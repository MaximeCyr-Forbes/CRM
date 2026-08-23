import type { CalendarBroker } from "../../data/calendar-types";
import { getSupabaseAdmin } from "../supabase/server";
import { getGoogleOAuthConfig } from "../google-calendar/config";
import { decryptGoogleToken, encryptGoogleToken } from "../google-calendar/token-crypto";

export type GoogleConnectionRow = {
  broker: CalendarBroker;
  google_account_email: string;
  calendar_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  access_token_expires_at: string;
  scopes: string[];
};

type GoogleRefreshTokenResponse = {
  access_token: string;
  expires_in: number;
};

export async function getGoogleConnection(broker: CalendarBroker) {
  const { data, error } = await getSupabaseAdmin()
    .from("google_calendar_connections")
    .select("*")
    .eq("broker", broker)
    .maybeSingle();
  if (error) throw error;
  return (data as GoogleConnectionRow | null) ?? null;
}

export async function refreshGoogleAccessToken(connection: GoogleConnectionRow) {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const refreshToken = await decryptGoogleToken(connection.encrypted_refresh_token);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) throw new Error(`Renouvellement Google refusé (${response.status}).`);

  const tokens = (await response.json()) as GoogleRefreshTokenResponse;
  const { error } = await getSupabaseAdmin()
    .from("google_calendar_connections")
    .update({
      encrypted_access_token: await encryptGoogleToken(tokens.access_token),
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    })
    .eq("broker", connection.broker);
  if (error) throw error;
  return tokens.access_token;
}

export async function getGoogleAccessToken(connection: GoogleConnectionRow, forceRefresh = false) {
  const expiresSoon = new Date(connection.access_token_expires_at).getTime() <= Date.now() + 60_000;
  if (forceRefresh || expiresSoon) return refreshGoogleAccessToken(connection);
  return decryptGoogleToken(connection.encrypted_access_token);
}

export async function googleAuthenticatedRequest(
  connection: GoogleConnectionRow,
  url: string,
  init: RequestInit,
) {
  const send = async (token: string) => fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  let response = await send(await getGoogleAccessToken(connection));
  if (response.status === 401) {
    response = await send(await getGoogleAccessToken(connection, true));
  }
  return response;
}
