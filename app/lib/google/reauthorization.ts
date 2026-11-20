import { createHash } from "node:crypto";
import type { CalendarBroker } from "../../data/calendar-types";
import { crmMemberContext } from "../auth/context";
import { createOAuthState } from "../google-calendar/oauth-state";
import { encryptGoogleToken } from "../google-calendar/token-crypto";
import { GMAIL_SEND_SCOPE, GMAIL_SETTINGS_BASIC_SCOPE } from "../google-gmail/scopes";
import { googleConnectionDatabase } from "./credential-access";
import { getGoogleConnection, type GoogleConnectionRow } from "./connection";
import type { GoogleTokenResponse } from "./google-account";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const fingerprint = (connection: GoogleConnectionRow) => hash(JSON.stringify([
  connection.google_account_email, connection.encrypted_refresh_token, connection.scopes, connection.calendar_id,
]));

function actor(broker: CalendarBroker) {
  const member = crmMemberContext.getStore();
  if (!member || !member.brokers.includes(broker)) throw new Error("Identité CRM autorisée requise.");
  return member.authUserId;
}

export async function beginGoogleReauthorization(broker: CalendarBroker) {
  const actorId = actor(broker);
  const connection = await getGoogleConnection(broker);
  if (!connection) throw new Error("Connexion Google existante requise.");
  const state = await createOAuthState(broker, "gmail", "/settings?googleReauthorize=1", "reauthorize");
  const { error } = await googleConnectionDatabase(broker).from("google_oauth_reauthorizations").insert({
    state_hash: hash(state), actor_id: actorId, broker,
    connection_fingerprint: fingerprint(connection),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error("Impossible de préparer la réautorisation Google.");
  return { state, email: connection.google_account_email,
    scopes: [...new Set(["openid", "email", ...connection.scopes, GMAIL_SEND_SCOPE, GMAIL_SETTINGS_BASIC_SCOPE])] };
}

/** Atomic consumption also invalidates cancelled callbacks; bound to the signed-in CRM actor. */
export async function consumeGoogleReauthorization(broker: CalendarBroker, state: string) {
  const actorId = actor(broker);
  const { data, error } = await googleConnectionDatabase(broker).from("google_oauth_reauthorizations")
    .delete().eq("state_hash", hash(state)).eq("actor_id", actorId).eq("broker", broker)
    .gt("expires_at", new Date().toISOString()).select("connection_fingerprint").maybeSingle();
  if (error || !data) throw new Error("Réautorisation expirée ou déjà utilisée. Recommencez depuis Paramètres.");
  const connection = await getGoogleConnection(broker);
  if (!connection || fingerprint(connection) !== data.connection_fingerprint) {
    throw new Error("La connexion Google a changé. Recommencez depuis Paramètres.");
  }
  return connection;
}

const canonicalScope = (scope: string) => scope === "email" ? "https://www.googleapis.com/auth/userinfo.email" : scope;

/** Credentials only: no disconnect, calendar sync, contact writes, or mail sending. */
export async function persistGoogleReauthorization(connection: GoogleConnectionRow, tokens: GoogleTokenResponse) {
  actor(connection.broker);
  if (!tokens.refresh_token || !tokens.access_token || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) {
    throw new Error("Google n’a pas fourni les nouveaux jetons requis. Connexion existante conservée.");
  }
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!response.ok) throw new Error("Impossible de vérifier l’identité Google. Connexion existante conservée.");
  const identity = await response.json() as { email?: string; email_verified?: boolean; sub?: string };
  if (identity.email_verified !== true || !identity.sub || typeof identity.email !== "string"
    || identity.email.trim().toLowerCase() !== connection.google_account_email.trim().toLowerCase()) {
    throw new Error("Autorisez le même compte Google que celui déjà associé à ce courtier. Connexion existante conservée.");
  }
  const scopes = [...new Set((tokens.scope ?? "").split(" ").filter(Boolean).map(canonicalScope))];
  if ([...connection.scopes, GMAIL_SEND_SCOPE, GMAIL_SETTINGS_BASIC_SCOPE].some(scope => !scopes.includes(canonicalScope(scope)))) {
    throw new Error("Toutes les permissions existantes doivent être accordées. Connexion existante conservée.");
  }
  const { data, error } = await googleConnectionDatabase(connection.broker).from("google_calendar_connections").update({
    encrypted_access_token: await encryptGoogleToken(tokens.access_token),
    encrypted_refresh_token: await encryptGoogleToken(tokens.refresh_token),
    access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), scopes,
  }).eq("broker", connection.broker).eq("google_account_email", connection.google_account_email)
    .eq("encrypted_refresh_token", connection.encrypted_refresh_token).eq("calendar_id", connection.calendar_id)
    .select("broker").maybeSingle();
  if (error || !data) throw new Error("La connexion Google n’a pas pu être renouvelée. Recommencez depuis Paramètres.");
}
