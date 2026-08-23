import type {
  CalendarBroker,
  CalendarConnectionStatus,
  CalendarWatchState,
  CalendarSyncResult,
  BirthdaySyncSummary,
  MortgageRenewalSyncSummary,
} from "../../data/calendar-types";
import type { Contact, ContactBroker, ContactSource } from "../../data/contact-types";
import { BROKER_LABELS, CLIENT_TYPE_LABELS, CONTACT_BROKERS, PRIORITY_LABELS, getContactName } from "../../data/contact-types";
import type { TransactionBroker } from "../../data/transaction-types";
import type { TransactionDeadlineRow, TransactionRow } from "../transactions/server-service";
import { getSupabaseAdmin } from "../supabase/server";
import { getGoogleOAuthConfig } from "./config";
import { decryptGoogleToken, encryptGoogleToken } from "./token-crypto";
import { formatBirthDate, normalizeBirthDate } from "../birth-date";
import { formatMortgageRenewalDate } from "../mortgage-renewal-date";
import type { CRMCalendarEvent, CRMCalendarEventInput } from "../../data/calendar-event-types";
import {
  buildGoogleCalendarEventPayload,
  isManagedCalendarEvent,
  mapGoogleCalendarEvent,
  type GoogleCalendarEventResource,
} from "./calendar-events";
import {
  getGoogleConnection as getConnection,
  googleAuthenticatedRequest,
  type GoogleConnectionRow,
} from "../google/connection";

export type ServerContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  birth_date: string | null;
  mortgage_renewal_date: string | null;
  civic_number: string;
  address: string;
  apartment: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  broker: ContactBroker;
  client_type: Contact["clientType"];
  client_provenance: Contact["clientProvenance"];
  priority: Contact["priority"];
  status: Contact["status"];
  source: ContactSource;
  last_contact_date: string | null;
  next_follow_up_date: string | null;
  google_calendar_event_id: string | null;
  google_calendar_event_broker: CalendarBroker | null;
  google_calendar_sync_status: Contact["googleCalendarSyncStatus"];
  google_calendar_last_error: string | null;
  created_at: string;
  updated_at: string;
};

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

type GoogleCalendarEventsListResponse = {
  items?: GoogleCalendarEventResource[];
  nextPageToken?: string;
};

type GoogleCalendarWatchRow = {
  broker: CalendarBroker;
  calendar_id: string;
  channel_id: string;
  resource_id: string | null;
  token_hash: string;
  expires_at: string | null;
  change_version: number | string;
  last_notification_at: string | null;
  last_resource_state: string | null;
};

type GoogleCalendarWatchResponse = {
  id?: string;
  resourceId?: string;
  expiration?: string;
};

const GOOGLE_WATCH_TTL_SECONDS = 604_800;
const GOOGLE_WATCH_RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export class GoogleCalendarNotConnectedError extends Error {}
export class GoogleCalendarEventNotFoundError extends Error {}
export class ManagedGoogleCalendarEventError extends Error {}

type GoogleEventPayload = {
  id?: string;
  summary: string;
  description: string;
  start: { date: string };
  end: { date: string };
  recurrence?: string[];
  transparency?: "transparent";
  visibility?: "private";
  reminders?: { useDefault: true };
  extendedProperties?: { private: Record<string, string> };
};

type BirthdayCalendarRow = {
  contact_id: string;
  broker: CalendarBroker;
  google_calendar_event_id: string | null;
  synced_birth_date: string | null;
  sync_status: Contact["googleCalendarSyncStatus"];
  last_error: string | null;
};

type MortgageRenewalCalendarRow = {
  contact_id: string;
  broker: CalendarBroker;
  google_calendar_event_id: string | null;
  synced_mortgage_renewal_date: string | null;
  sync_status: Contact["googleCalendarSyncStatus"];
  last_error: string | null;
};

type TransactionCalendarResult = {
  status: "synced" | "pending" | "error";
  message: string;
};

export function mapServerContact(row: ServerContactRow): Contact {
  const hasAddress = [row.civic_number, row.address, row.apartment, row.city, row.province, row.postal_code, row.country].some(Boolean);
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    birthDate: row.birth_date ?? "",
    mortgageRenewalDate: row.mortgage_renewal_date ?? "",
    civicNumber: row.civic_number ?? "",
    address: row.address ?? "",
    apartment: row.apartment ?? "",
    city: row.city ?? "",
    province: row.province ?? "",
    postalCode: row.postal_code ?? "",
    country: row.country ?? "",
    broker: row.broker,
    clientType: row.client_type,
    clientProvenance: row.client_provenance ?? null,
    priority: row.priority,
    status: row.status,
    source: row.source,
    lastContactDate: row.last_contact_date,
    nextFollowUpDate: row.next_follow_up_date,
    googleCalendarEventId: row.google_calendar_event_id,
    googleCalendarEventBroker: row.google_calendar_event_broker,
    googleCalendarSyncStatus: row.google_calendar_sync_status,
    googleCalendarLastError: row.google_calendar_last_error,
    addresses: hasAddress ? [{
      id: `primary:${row.id}`,
      contactId: row.id,
      civicNumber: row.civic_number ?? "",
      address: row.address ?? "",
      apartment: row.apartment ?? "",
      city: row.city ?? "",
      province: row.province ?? "",
      postalCode: row.postal_code ?? "",
      country: row.country ?? "",
      isPrimary: true,
      label: "Principale",
      createdAt: row.updated_at,
      updatedAt: row.updated_at,
    }] : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function addOneDay(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function createGoogleEventId() {
  return `ef${crypto.randomUUID().replace(/-/g, "")}`;
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function nextBirthdayOccurrence(birthDate: string, today = new Date().toISOString().slice(0, 10)) {
  const normalized = normalizeBirthDate(birthDate, { today });
  if (!normalized) throw new Error("Date de naissance invalide.");
  const [, month, day] = normalized.split("-").map(Number);
  const currentYear = Number(today.slice(0, 4));
  const occurrenceForYear = (year: number) => {
    const occurrenceDay = month === 2 && day === 29 ? (isLeapYear(year) ? 29 : 28) : day;
    return `${year}-${String(month).padStart(2, "0")}-${String(occurrenceDay).padStart(2, "0")}`;
  };
  const current = occurrenceForYear(currentYear);
  return current >= today ? current : occurrenceForYear(currentYear + 1);
}

export function buildBirthdayEventPayload(
  contact: ServerContactRow,
  broker: CalendarBroker,
  eventId?: string,
  today?: string,
): GoogleEventPayload {
  if (!contact.birth_date) throw new Error("Le contact ne contient aucune date de naissance.");
  const startDate = nextBirthdayOccurrence(contact.birth_date, today);
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Contact sans nom";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "");
  const details = [
    "Anniversaire client — Équipe Forbes", "", `Client : ${name}`,
    `Date de naissance : ${formatBirthDate(contact.birth_date)}`,
    contact.phone ? `Téléphone : ${contact.phone}` : null,
    contact.email ? `Email : ${contact.email}` : null,
    `Courtier CRM : ${BROKER_LABELS[contact.broker]}`,
    appUrl ? `Fiche CRM : ${appUrl}/contacts/${contact.id}` : null,
  ].filter((line): line is string => Boolean(line));
  const isLeapBirthday = contact.birth_date.slice(5) === "02-29";
  return {
    ...(eventId ? { id: eventId } : {}),
    summary: `🎂 Anniversaire — ${name}`,
    description: details.join("\n"),
    start: { date: startDate },
    end: { date: addOneDay(startDate) },
    recurrence: [isLeapBirthday ? "RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1" : "RRULE:FREQ=YEARLY"],
    transparency: "transparent",
    visibility: "private",
    reminders: { useDefault: true },
    extendedProperties: { private: { eventKind: "birthday", crmContactId: contact.id, crmBroker: broker } },
  };
}

export function buildMortgageRenewalEventPayload(
  contact: ServerContactRow,
  broker: CalendarBroker,
  eventId?: string,
): GoogleEventPayload {
  if (!contact.mortgage_renewal_date) {
    throw new Error("Le contact ne contient aucune date de renouvellement hypothécaire.");
  }
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Contact sans nom";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "");
  const details = [
    "Renouvellement hypothécaire — Équipe Forbes",
    "",
    `Client : ${name}`,
    `Date : ${formatMortgageRenewalDate(contact.mortgage_renewal_date)}`,
    contact.phone ? `Téléphone : ${contact.phone}` : null,
    contact.email ? `Email : ${contact.email}` : null,
    `Courtier CRM : ${BROKER_LABELS[contact.broker]}`,
    appUrl ? `Fiche CRM : ${appUrl}/contacts/${contact.id}` : null,
  ].filter((line): line is string => Boolean(line));
  return {
    ...(eventId ? { id: eventId } : {}),
    summary: `🏠 Renouvellement hypothécaire — ${name}`,
    description: details.join("\n"),
    start: { date: contact.mortgage_renewal_date },
    end: { date: addOneDay(contact.mortgage_renewal_date) },
    transparency: "transparent",
    visibility: "private",
    reminders: { useDefault: true },
    extendedProperties: {
      private: { eventKind: "mortgage-renewal", crmContactId: contact.id, crmBroker: broker },
    },
  };
}

function buildEventPayload(contact: ServerContactRow, eventId?: string): GoogleEventPayload {
  if (!contact.next_follow_up_date) {
    throw new Error("La relance ne contient aucune date.");
  }

  const displayContact = mapServerContact(contact);
  const details = [
    "Relance CRM — Équipe Forbes",
    "",
    `Client : ${getContactName(displayContact)}`,
    contact.phone ? `Téléphone : ${contact.phone}` : null,
    contact.email ? `Email : ${contact.email}` : null,
    contact.client_type ? `Type : ${CLIENT_TYPE_LABELS[contact.client_type]}` : null,
    contact.priority ? `Priorité : ${PRIORITY_LABELS[contact.priority]}` : null,
  ].filter((line): line is string => Boolean(line));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "");
  if (appUrl) {
    details.push("", `Fiche CRM : ${appUrl}/contacts/${contact.id}`);
  }

  return {
    ...(eventId ? { id: eventId } : {}),
    summary: `Relance client — ${getContactName(displayContact)}`,
    description: details.join("\n"),
    start: { date: contact.next_follow_up_date },
    end: { date: addOneDay(contact.next_follow_up_date) },
  };
}

async function googleCalendarRequest(
  connection: GoogleConnectionRow,
  path: string,
  init: RequestInit,
) {
  return googleAuthenticatedRequest(
    connection,
    `https://www.googleapis.com/calendar/v3${path}`,
    init,
  );
}

async function requireGoogleCalendarConnection(broker: CalendarBroker) {
  const connection = await getConnection(broker);
  if (!connection) throw new GoogleCalendarNotConnectedError("Google Agenda non connecté.");
  return connection;
}

async function readGoogleCalendarEvent(
  connection: GoogleConnectionRow,
  eventId: string,
) {
  const calendarId = encodeURIComponent(connection.calendar_id);
  const response = await googleCalendarRequest(
    connection,
    `/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
    { method: "GET" },
  );
  if (response.status === 404 || response.status === 410) {
    throw new GoogleCalendarEventNotFoundError("Cet événement n’existe plus dans Google Agenda.");
  }
  if (!response.ok) throw new Error(`Lecture Google refusée (${response.status}).`);
  return response.json() as Promise<GoogleCalendarEventResource>;
}

export async function listGoogleCalendarEvents(
  broker: CalendarBroker,
  start: string,
  end: string,
): Promise<CRMCalendarEvent[]> {
  const connection = await requireGoogleCalendarConnection(broker);
  const calendarId = encodeURIComponent(connection.calendar_id);
  const events: CRMCalendarEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const search = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: start,
      timeMax: end,
      maxResults: "250",
    });
    if (pageToken) search.set("pageToken", pageToken);
    const response = await googleCalendarRequest(
      connection,
      `/calendars/${calendarId}/events?${search.toString()}`,
      { method: "GET" },
    );
    if (!response.ok) throw new Error(`Chargement Google refusé (${response.status}).`);
    const payload = await response.json() as GoogleCalendarEventsListResponse;
    for (const item of payload.items ?? []) {
      try {
        events.push(mapGoogleCalendarEvent(item, broker));
      } catch {
        // Un événement Google incomplet ne doit pas masquer le reste du calendrier.
      }
    }
    pageToken = payload.nextPageToken;
    if (!pageToken) return events;
  }
  throw new Error("Pagination Google Agenda anormalement longue.");
}

export async function createGoogleCalendarEvent(
  input: CRMCalendarEventInput,
): Promise<CRMCalendarEvent> {
  const connection = await requireGoogleCalendarConnection(input.broker);
  const calendarId = encodeURIComponent(connection.calendar_id);
  const response = await googleCalendarRequest(
    connection,
    `/calendars/${calendarId}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGoogleCalendarEventPayload(input)),
    },
  );
  if (!response.ok) throw new Error(`Création Google refusée (${response.status}).`);
  return mapGoogleCalendarEvent(await response.json() as GoogleCalendarEventResource, input.broker);
}

export async function updateGoogleCalendarEvent(
  eventId: string,
  input: CRMCalendarEventInput,
): Promise<CRMCalendarEvent> {
  const connection = await requireGoogleCalendarConnection(input.broker);
  const existing = await readGoogleCalendarEvent(connection, eventId);
  if (isManagedCalendarEvent(existing) || existing.recurringEventId || existing.recurrence?.length) {
    throw new ManagedGoogleCalendarEventError("Cet événement est géré automatiquement par le CRM.");
  }
  const calendarId = encodeURIComponent(connection.calendar_id);
  const response = await googleCalendarRequest(
    connection,
    `/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGoogleCalendarEventPayload(input)),
    },
  );
  if (response.status === 404 || response.status === 410) {
    throw new GoogleCalendarEventNotFoundError("Cet événement n’existe plus dans Google Agenda.");
  }
  if (!response.ok) throw new Error(`Modification Google refusée (${response.status}).`);
  return mapGoogleCalendarEvent(await response.json() as GoogleCalendarEventResource, input.broker);
}

export async function deleteGoogleCalendarEvent(
  broker: CalendarBroker,
  eventId: string,
) {
  const connection = await requireGoogleCalendarConnection(broker);
  const existing = await readGoogleCalendarEvent(connection, eventId);
  if (isManagedCalendarEvent(existing) || existing.recurringEventId || existing.recurrence?.length) {
    throw new ManagedGoogleCalendarEventError("Cet événement est géré automatiquement par le CRM.");
  }
  const calendarId = encodeURIComponent(connection.calendar_id);
  const response = await googleCalendarRequest(
    connection,
    `/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  if (response.status === 404 || response.status === 410) {
    throw new GoogleCalendarEventNotFoundError("Cet événement n’existe plus dans Google Agenda.");
  }
  if (!response.ok) throw new Error(`Suppression Google refusée (${response.status}).`);
}

async function deleteGoogleEvent(
  connection: GoogleConnectionRow,
  eventId: string,
) {
  const calendarId = encodeURIComponent(connection.calendar_id);
  const response = await googleCalendarRequest(
    connection,
    `/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error(`Suppression Google refusée (${response.status}).`);
  }
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(value: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(first: string, second: string) {
  let difference = first.length ^ second.length;
  const length = Math.max(first.length, second.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (first.charCodeAt(index) || 0) ^ (second.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function watchState(row: GoogleCalendarWatchRow | null): CalendarWatchState {
  const expiresAt = row?.expires_at ?? null;
  return {
    changeVersion: Number(row?.change_version ?? 0),
    lastNotificationAt: row?.last_notification_at ?? null,
    watchActive: Boolean(
      row?.channel_id &&
      row.resource_id &&
      expiresAt &&
      new Date(expiresAt).getTime() > Date.now() + 60_000,
    ),
    expiresAt,
  };
}

async function readGoogleCalendarWatch(broker: CalendarBroker) {
  const { data, error } = await getSupabaseAdmin()
    .from("google_calendar_watch_channels")
    .select("*")
    .eq("broker", broker)
    .maybeSingle();
  if (error) throw error;
  return (data as GoogleCalendarWatchRow | null) ?? null;
}

function getGoogleCalendarWebhookUrl() {
  if (process.env.VERCEL_ENV === "preview") {
    throw new Error("Les notifications Google ne sont pas créées depuis un déploiement Preview.");
  }
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "");
  if (!configuredOrigin) {
    throw new Error("NEXT_PUBLIC_APP_URL est requis pour activer les notifications Google.");
  }
  const origin = new URL(configuredOrigin);
  if (origin.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_APP_URL doit utiliser HTTPS pour activer les notifications Google.");
  }
  return `${configuredOrigin}/api/google-calendar/webhook`;
}

async function stopGoogleCalendarWatchChannel(
  connection: GoogleConnectionRow,
  channel: Pick<GoogleCalendarWatchRow, "channel_id" | "resource_id">,
) {
  if (!channel.resource_id) return;
  const response = await googleCalendarRequest(connection, "/channels/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: channel.channel_id, resourceId: channel.resource_id }),
  });
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error(`Arrêt du canal Google refusé (${response.status}).`);
  }
}

export async function getGoogleCalendarWatchState(
  broker: CalendarBroker,
): Promise<CalendarWatchState> {
  return watchState(await readGoogleCalendarWatch(broker));
}

export async function startGoogleCalendarWatch(broker: CalendarBroker) {
  const connection = await requireGoogleCalendarConnection(broker);
  const webhookUrl = getGoogleCalendarWebhookUrl();
  const previous = await readGoogleCalendarWatch(broker);
  const channelId = crypto.randomUUID();
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const rawToken = bytesToBase64Url(tokenBytes);
  const tokenHash = await sha256Hex(rawToken);
  const pending = {
    broker,
    calendar_id: connection.calendar_id,
    channel_id: channelId,
    resource_id: null,
    token_hash: tokenHash,
    expires_at: null,
  };
  const { error: pendingError } = await getSupabaseAdmin()
    .from("google_calendar_watch_channels")
    .upsert(pending, { onConflict: "broker" });
  if (pendingError) throw pendingError;

  let createdChannel: GoogleCalendarWatchResponse | null = null;
  try {
    const calendarId = encodeURIComponent(connection.calendar_id);
    const response = await googleCalendarRequest(
      connection,
      `/calendars/${calendarId}/events/watch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: channelId,
          type: "web_hook",
          address: webhookUrl,
          token: rawToken,
          params: { ttl: String(GOOGLE_WATCH_TTL_SECONDS) },
        }),
      },
    );
    if (!response.ok) throw new Error(`Création du canal Google refusée (${response.status}).`);
    createdChannel = await response.json() as GoogleCalendarWatchResponse;
    if (!createdChannel.resourceId || !createdChannel.expiration) {
      throw new Error("Google n’a pas retourné les métadonnées du canal.");
    }
    const expiresAt = new Date(Number(createdChannel.expiration)).toISOString();
    const { error: updateError } = await getSupabaseAdmin()
      .from("google_calendar_watch_channels")
      .update({ resource_id: createdChannel.resourceId, expires_at: expiresAt })
      .eq("broker", broker)
      .eq("channel_id", channelId);
    if (updateError) throw updateError;

    if (previous?.resource_id && previous.channel_id !== channelId) {
      await stopGoogleCalendarWatchChannel(connection, previous).catch((error) => {
        console.warn("Ancien canal Google Calendar impossible à arrêter:", error instanceof Error ? error.message : "Erreur inconnue");
      });
    }
    return getGoogleCalendarWatchState(broker);
  } catch (error) {
    if (createdChannel?.resourceId) {
      await stopGoogleCalendarWatchChannel(connection, {
        channel_id: channelId,
        resource_id: createdChannel.resourceId,
      }).catch(() => undefined);
    }
    if (previous) {
      await getSupabaseAdmin()
        .from("google_calendar_watch_channels")
        .upsert(previous, { onConflict: "broker" });
    } else {
      await getSupabaseAdmin()
        .from("google_calendar_watch_channels")
        .delete()
        .eq("broker", broker)
        .eq("channel_id", channelId);
    }
    throw error;
  }
}

export async function ensureGoogleCalendarWatch(broker: CalendarBroker) {
  const current = await readGoogleCalendarWatch(broker);
  if (
    current?.resource_id &&
    current.expires_at &&
    new Date(current.expires_at).getTime() > Date.now() + GOOGLE_WATCH_RENEWAL_WINDOW_MS
  ) {
    return watchState(current);
  }
  return startGoogleCalendarWatch(broker);
}

export async function stopGoogleCalendarWatch(broker: CalendarBroker) {
  const [connection, channel] = await Promise.all([
    getConnection(broker),
    readGoogleCalendarWatch(broker),
  ]);
  if (!channel) return;
  if (connection && channel.resource_id) {
    await stopGoogleCalendarWatchChannel(connection, channel).catch((error) => {
      console.warn("Canal Google Calendar impossible à arrêter:", error instanceof Error ? error.message : "Erreur inconnue");
    });
  }
  const { error } = await getSupabaseAdmin()
    .from("google_calendar_watch_channels")
    .delete()
    .eq("broker", broker);
  if (error) throw error;
}

export async function processGoogleCalendarWebhook(headers: Headers) {
  const channelId = headers.get("X-Goog-Channel-ID")?.trim();
  const rawToken = headers.get("X-Goog-Channel-Token")?.trim();
  const resourceId = headers.get("X-Goog-Resource-ID")?.trim();
  const resourceState = headers.get("X-Goog-Resource-State")?.trim().toLowerCase();
  const messageNumber = headers.get("X-Goog-Message-Number")?.trim() ?? null;
  const channelExpiration = headers.get("X-Goog-Channel-Expiration")?.trim() ?? null;
  if (!channelId || !rawToken || !resourceId || !resourceState) return false;
  if (!["sync", "exists", "not_exists"].includes(resourceState)) return false;

  const { data, error } = await getSupabaseAdmin()
    .from("google_calendar_watch_channels")
    .select("*")
    .eq("channel_id", channelId)
    .maybeSingle();
  if (error) throw error;
  const channel = (data as GoogleCalendarWatchRow | null) ?? null;
  if (!channel) return false;
  const receivedHash = await sha256Hex(rawToken);
  if (!constantTimeEqual(receivedHash, channel.token_hash)) {
    console.warn("Notification Google Calendar refusée: token de canal invalide.");
    return false;
  }
  if (channel.resource_id && channel.resource_id !== resourceId) return false;
  if (!channel.resource_id && resourceState !== "sync") return false;

  const { error: notifyError } = await getSupabaseAdmin().rpc(
    "notify_google_calendar_change",
    {
      p_channel_id: channelId,
      p_resource_id: resourceId,
      p_resource_state: resourceState,
    },
  );
  if (notifyError) throw notifyError;
  console.info("Notification Google Calendar reçue", {
    broker: channel.broker,
    resourceState,
    channelId: `${channelId.slice(0, 8)}…`,
    messageNumber,
    channelExpiration,
  });
  return true;
}

function buildDeadlineEventPayload(
  transaction: TransactionRow,
  deadline: TransactionDeadlineRow,
  eventId?: string,
): GoogleEventPayload {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "");
  const details = [
    "Échéance de transaction — Équipe Forbes",
    "",
    `Transaction : ${transaction.address}`,
    `Échéance : ${deadline.title}`,
    appUrl ? `Fiche CRM : ${appUrl}/transactions/${transaction.id}` : null,
  ].filter((line): line is string => Boolean(line));
  return {
    ...(eventId ? { id: eventId } : {}),
    summary: `${deadline.title} — ${transaction.address}`,
    description: details.join("\n"),
    start: { date: deadline.due_date },
    end: { date: addOneDay(deadline.due_date) },
  };
}

async function upsertDeadlineGoogleEvent(
  connection: GoogleConnectionRow,
  transaction: TransactionRow,
  deadline: TransactionDeadlineRow,
  eventId: string,
  eventExists: boolean,
) {
  const calendarId = encodeURIComponent(connection.calendar_id);
  const eventPath = `/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`;
  const updateEvent = () => googleCalendarRequest(connection, eventPath, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildDeadlineEventPayload(transaction, deadline)),
  });
  const insertEvent = () => googleCalendarRequest(connection, `/calendars/${calendarId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildDeadlineEventPayload(transaction, deadline, eventId)),
  });
  let response = eventExists ? await updateEvent() : await insertEvent();
  if (eventExists && (response.status === 404 || response.status === 410)) response = await insertEvent();
  else if (!eventExists && response.status === 409) response = await updateEvent();
  if (!response.ok) throw new Error(`Synchronisation Google refusée (${response.status}).`);
}

export async function syncTransactionDeadline(deadlineId: string): Promise<TransactionCalendarResult> {
  const admin = getSupabaseAdmin();
  const { data: deadlineData, error: deadlineError } = await admin
    .from("transaction_deadlines")
    .select("*")
    .eq("id", deadlineId)
    .single();
  if (deadlineError) throw deadlineError;
  let deadline = deadlineData as TransactionDeadlineRow;
  const { data: transactionData, error: transactionError } = await admin
    .from("transactions")
    .select("*")
    .eq("id", deadline.transaction_id)
    .single();
  if (transactionError) throw transactionError;
  const transaction = transactionData as TransactionRow;

  try {
    const broker = transaction.broker as TransactionBroker;
    if (deadline.google_calendar_event_id && deadline.google_calendar_event_broker !== broker) {
      const oldConnection = deadline.google_calendar_event_broker
        ? await getConnection(deadline.google_calendar_event_broker)
        : null;
      if (oldConnection) await deleteGoogleEvent(oldConnection, deadline.google_calendar_event_id);
      const { data, error } = await admin.from("transaction_deadlines").update({
        google_calendar_event_id: null,
        google_calendar_event_broker: null,
        google_calendar_sync_status: "pending",
        google_calendar_last_error: null,
      }).eq("id", deadline.id).select("*").single();
      if (error) throw error;
      deadline = data as TransactionDeadlineRow;
    }

    const connection = await getConnection(broker);
    if (!connection) {
      await admin.from("transaction_deadlines").update({
        google_calendar_sync_status: "pending",
        google_calendar_last_error: "Google Agenda non connecté.",
      }).eq("id", deadline.id);
      return { status: "pending", message: "Échéance enregistrée · Google Agenda non connecté." };
    }

    const eventExists = Boolean(deadline.google_calendar_event_id && deadline.google_calendar_event_broker === broker);
    const eventId = eventExists ? deadline.google_calendar_event_id! : createGoogleEventId();
    if (!eventExists) {
      const { data, error } = await admin.from("transaction_deadlines").update({
        google_calendar_event_id: eventId,
        google_calendar_event_broker: broker,
        google_calendar_sync_status: "pending",
        google_calendar_last_error: null,
      }).eq("id", deadline.id).select("*").single();
      if (error) throw error;
      deadline = data as TransactionDeadlineRow;
    }
    await upsertDeadlineGoogleEvent(connection, transaction, deadline, eventId, eventExists);
    await admin.from("transaction_deadlines").update({
      google_calendar_event_id: eventId,
      google_calendar_event_broker: broker,
      google_calendar_sync_status: "synced",
      google_calendar_last_error: null,
    }).eq("id", deadline.id);
    return { status: "synced", message: "Échéance synchronisée avec Google Agenda." };
  } catch (error) {
    await admin.from("transaction_deadlines").update({
      google_calendar_sync_status: "error",
      google_calendar_last_error: calendarFailureMessage(error),
    }).eq("id", deadline.id);
    return { status: "error", message: "Échéance enregistrée · synchronisation Google Agenda impossible." };
  }
}

export async function deleteCalendarEventForTransactionDeadline(
  deadline: Pick<TransactionDeadlineRow, "google_calendar_event_id" | "google_calendar_event_broker">,
) {
  if (!deadline.google_calendar_event_id || !deadline.google_calendar_event_broker) return;
  const connection = await getConnection(deadline.google_calendar_event_broker);
  if (!connection) return;
  await deleteGoogleEvent(connection, deadline.google_calendar_event_id);
}

export async function deleteCalendarEventForContact(
  contact: Pick<Contact, "googleCalendarEventId" | "googleCalendarEventBroker">,
) {
  if (!contact.googleCalendarEventId || !contact.googleCalendarEventBroker) {
    return;
  }
  const connection = await getConnection(contact.googleCalendarEventBroker);
  if (!connection) {
    throw new Error(
      `Google Agenda de ${contact.googleCalendarEventBroker} n’est plus connecté.`,
    );
  }
  await deleteGoogleEvent(connection, contact.googleCalendarEventId);
}

async function upsertGoogleEvent(
  connection: GoogleConnectionRow,
  contact: ServerContactRow,
  eventId: string,
  eventExists: boolean,
) {
  const calendarId = encodeURIComponent(connection.calendar_id);
  const eventPath = `/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`;
  const updateEvent = () =>
    googleCalendarRequest(connection, eventPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildEventPayload(contact)),
    });
  const insertEvent = () =>
    googleCalendarRequest(connection, `/calendars/${calendarId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildEventPayload(contact, eventId)),
    });

  let response = eventExists ? await updateEvent() : await insertEvent();
  if (eventExists && (response.status === 404 || response.status === 410)) {
    response = await insertEvent();
  } else if (!eventExists && response.status === 409) {
    response = await updateEvent();
  }
  if (!response.ok) {
    throw new Error(`Synchronisation Google refusée (${response.status}).`);
  }
}

async function upsertBirthdayGoogleEvent(
  connection: GoogleConnectionRow,
  contact: ServerContactRow,
  broker: CalendarBroker,
  eventId: string,
  eventExists: boolean,
) {
  const calendarId = encodeURIComponent(connection.calendar_id);
  const eventPath = `/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`;
  const updateEvent = () => googleCalendarRequest(connection, eventPath, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildBirthdayEventPayload(contact, broker)),
  });
  const insertEvent = () => googleCalendarRequest(connection, `/calendars/${calendarId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildBirthdayEventPayload(contact, broker, eventId)),
  });
  let activeEventId = eventId;
  let response = eventExists ? await updateEvent() : await insertEvent();
  if (eventExists && (response.status === 404 || response.status === 410)) {
    activeEventId = createGoogleEventId();
    response = await googleCalendarRequest(connection, `/calendars/${calendarId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBirthdayEventPayload(contact, broker, activeEventId)),
    });
  } else if (!eventExists && response.status === 409) response = await updateEvent();
  if (!response.ok) throw new Error(`Synchronisation anniversaire Google refusée (${response.status}).`);
  return activeEventId;
}

async function processBirthdayRow(
  row: BirthdayCalendarRow,
  contact: ServerContactRow | undefined,
  connection: GoogleConnectionRow | undefined,
): Promise<"synced" | "pending" | "error"> {
  const admin = getSupabaseAdmin();
  if (!contact) {
    await admin.from("contact_birthday_calendar_events").delete().eq("contact_id", row.contact_id).eq("broker", row.broker);
    return "synced";
  }
  if (!connection) {
    await admin.from("contact_birthday_calendar_events").update({ sync_status: "pending", last_error: "Google Agenda non connecté." }).eq("contact_id", row.contact_id).eq("broker", row.broker);
    return "pending";
  }
  try {
    if (!contact.birth_date) {
      if (row.google_calendar_event_id) await deleteGoogleEvent(connection, row.google_calendar_event_id);
      const { error } = await admin.from("contact_birthday_calendar_events").delete().eq("contact_id", row.contact_id).eq("broker", row.broker);
      if (error) throw error;
      return "synced";
    }
    const eventExists = Boolean(row.google_calendar_event_id);
    const eventId = row.google_calendar_event_id ?? createGoogleEventId();
    if (!eventExists) {
      const { error } = await admin.from("contact_birthday_calendar_events").update({ google_calendar_event_id: eventId, sync_status: "pending", last_error: null }).eq("contact_id", row.contact_id).eq("broker", row.broker);
      if (error) throw error;
    }
    const activeEventId = await upsertBirthdayGoogleEvent(connection, contact, row.broker, eventId, eventExists);
    const { error } = await admin.from("contact_birthday_calendar_events").update({
      google_calendar_event_id: activeEventId,
      synced_birth_date: contact.birth_date,
      sync_status: "synced",
      last_error: null,
    }).eq("contact_id", row.contact_id).eq("broker", row.broker);
    if (error) throw error;
    return "synced";
  } catch (error) {
    await admin.from("contact_birthday_calendar_events").update({ sync_status: "error", last_error: calendarFailureMessage(error) }).eq("contact_id", row.contact_id).eq("broker", row.broker);
    return "error";
  }
}

export async function syncContactBirthdays(options: {
  contactIds?: ReadonlyArray<string>;
  broker?: CalendarBroker;
  limit?: number;
  retryErrors?: boolean;
} = {}): Promise<BirthdaySyncSummary> {
  const admin = getSupabaseAdmin();
  const limit = Math.max(1, Math.min(options.limit ?? 40, 100));
  const { data: connections, error: connectionsError } = await admin.from("google_calendar_connections").select("*");
  if (connectionsError) throw connectionsError;
  const connectionRows = (connections ?? []) as GoogleConnectionRow[];
  let query = admin.from("contact_birthday_calendar_events").select("*").limit(limit);
  if (options.broker) query = query.eq("broker", options.broker);
  if (options.contactIds?.length) query = query.in("contact_id", [...new Set(options.contactIds)].slice(0, 100));
  else {
    const connectedBrokers = connectionRows.map((connection) => connection.broker);
    if (connectedBrokers.length === 0) return { synced: 0, pending: 0, error: 0, processed: 0 };
    query = query.in("broker", connectedBrokers);
    query = options.retryErrors === false ? query.eq("sync_status", "pending") : query.in("sync_status", ["pending", "error"]);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as BirthdayCalendarRow[];
  if (rows.length === 0) return { synced: 0, pending: 0, error: 0, processed: 0 };

  const contactIds = [...new Set(rows.map((row) => row.contact_id))];
  const { data: contacts, error: contactsError } = await admin.from("contacts").select("*").in("id", contactIds);
  if (contactsError) throw contactsError;
  const contactMap = new Map(((contacts ?? []) as ServerContactRow[]).map((contact) => [contact.id, contact]));
  const connectionMap = new Map(connectionRows.map((connection) => [connection.broker, connection]));
  const results: Array<"synced" | "pending" | "error"> = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      results.push(await processBirthdayRow(row, contactMap.get(row.contact_id), connectionMap.get(row.broker)));
    }
  }));
  return {
    synced: results.filter((status) => status === "synced").length,
    pending: results.filter((status) => status === "pending").length,
    error: results.filter((status) => status === "error").length,
    processed: results.length,
  };
}

async function upsertMortgageRenewalGoogleEvent(
  connection: GoogleConnectionRow,
  contact: ServerContactRow,
  broker: CalendarBroker,
  eventId: string,
  eventExists: boolean,
) {
  const calendarId = encodeURIComponent(connection.calendar_id);
  const eventPath = `/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`;
  const updateEvent = () => googleCalendarRequest(connection, eventPath, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildMortgageRenewalEventPayload(contact, broker)),
  });
  const insertEvent = (activeEventId: string) => googleCalendarRequest(
    connection,
    `/calendars/${calendarId}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildMortgageRenewalEventPayload(contact, broker, activeEventId)),
    },
  );
  let activeEventId = eventId;
  let response = eventExists ? await updateEvent() : await insertEvent(activeEventId);
  if (eventExists && (response.status === 404 || response.status === 410)) {
    activeEventId = createGoogleEventId();
    response = await insertEvent(activeEventId);
  } else if (!eventExists && response.status === 409) {
    response = await updateEvent();
  }
  if (!response.ok) {
    throw new Error(`Synchronisation du renouvellement Google refusée (${response.status}).`);
  }
  return activeEventId;
}

async function processMortgageRenewalRow(
  row: MortgageRenewalCalendarRow,
  contact: ServerContactRow | undefined,
  connection: GoogleConnectionRow | undefined,
): Promise<"synced" | "pending" | "error"> {
  const admin = getSupabaseAdmin();
  if (!contact) {
    await admin.from("contact_mortgage_renewal_calendar_events").delete().eq("contact_id", row.contact_id).eq("broker", row.broker);
    return "synced";
  }
  if (!connection) {
    await admin.from("contact_mortgage_renewal_calendar_events").update({
      sync_status: "pending",
      last_error: "Google Agenda non connecté.",
    }).eq("contact_id", row.contact_id).eq("broker", row.broker);
    return "pending";
  }
  try {
    if (!contact.mortgage_renewal_date) {
      if (row.google_calendar_event_id) await deleteGoogleEvent(connection, row.google_calendar_event_id);
      const { error } = await admin.from("contact_mortgage_renewal_calendar_events").delete().eq("contact_id", row.contact_id).eq("broker", row.broker);
      if (error) throw error;
      return "synced";
    }
    const eventExists = Boolean(row.google_calendar_event_id);
    const eventId = row.google_calendar_event_id ?? createGoogleEventId();
    if (!eventExists) {
      const { error } = await admin.from("contact_mortgage_renewal_calendar_events").update({
        google_calendar_event_id: eventId,
        sync_status: "pending",
        last_error: null,
      }).eq("contact_id", row.contact_id).eq("broker", row.broker);
      if (error) throw error;
    }
    const activeEventId = await upsertMortgageRenewalGoogleEvent(connection, contact, row.broker, eventId, eventExists);
    const { error } = await admin.from("contact_mortgage_renewal_calendar_events").update({
      google_calendar_event_id: activeEventId,
      synced_mortgage_renewal_date: contact.mortgage_renewal_date,
      sync_status: "synced",
      last_error: null,
    }).eq("contact_id", row.contact_id).eq("broker", row.broker);
    if (error) throw error;
    return "synced";
  } catch (error) {
    await admin.from("contact_mortgage_renewal_calendar_events").update({
      sync_status: "error",
      last_error: calendarFailureMessage(error),
    }).eq("contact_id", row.contact_id).eq("broker", row.broker);
    return "error";
  }
}

export async function syncContactMortgageRenewals(options: {
  contactIds?: ReadonlyArray<string>;
  broker?: CalendarBroker;
  limit?: number;
  retryErrors?: boolean;
} = {}): Promise<MortgageRenewalSyncSummary> {
  const admin = getSupabaseAdmin();
  const limit = Math.max(1, Math.min(options.limit ?? 40, 100));
  const { data: connections, error: connectionsError } = await admin.from("google_calendar_connections").select("*");
  if (connectionsError) throw connectionsError;
  const connectionRows = (connections ?? []) as GoogleConnectionRow[];
  let query = admin.from("contact_mortgage_renewal_calendar_events").select("*").limit(limit);
  if (options.broker) query = query.eq("broker", options.broker);
  if (options.contactIds?.length) {
    query = query.in("contact_id", [...new Set(options.contactIds)].slice(0, 100));
  } else {
    const connectedBrokers = connectionRows.map((connection) => connection.broker);
    if (connectedBrokers.length === 0) return { synced: 0, pending: 0, error: 0, processed: 0 };
    query = query.in("broker", connectedBrokers);
    query = options.retryErrors === false ? query.eq("sync_status", "pending") : query.in("sync_status", ["pending", "error"]);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as MortgageRenewalCalendarRow[];
  if (rows.length === 0) return { synced: 0, pending: 0, error: 0, processed: 0 };
  const contactIds = [...new Set(rows.map((row) => row.contact_id))];
  const { data: contacts, error: contactsError } = await admin.from("contacts").select("*").in("id", contactIds);
  if (contactsError) throw contactsError;
  const contactMap = new Map(((contacts ?? []) as ServerContactRow[]).map((contact) => [contact.id, contact]));
  const connectionMap = new Map(connectionRows.map((connection) => [connection.broker, connection]));
  const results: Array<"synced" | "pending" | "error"> = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      results.push(await processMortgageRenewalRow(row, contactMap.get(row.contact_id), connectionMap.get(row.broker)));
    }
  }));
  return {
    synced: results.filter((status) => status === "synced").length,
    pending: results.filter((status) => status === "pending").length,
    error: results.filter((status) => status === "error").length,
    processed: results.length,
  };
}

export async function deleteMortgageRenewalEventsForContact(contactId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("contact_mortgage_renewal_calendar_events").select("*").eq("contact_id", contactId);
  if (error) throw error;
  const rows = (data ?? []) as MortgageRenewalCalendarRow[];
  for (const row of rows) {
    if (!row.google_calendar_event_id) continue;
    const connection = await getConnection(row.broker);
    if (connection) await deleteGoogleEvent(connection, row.google_calendar_event_id);
  }
  const result = await admin.from("contact_mortgage_renewal_calendar_events").delete().eq("contact_id", contactId);
  if (result.error) throw result.error;
}

export async function queueContactMortgageRenewals(contactId: string) {
  const rows = CONTACT_BROKERS.map((broker) => ({
    contact_id: contactId,
    broker,
    sync_status: "pending" as const,
    last_error: null,
  }));
  const { error } = await getSupabaseAdmin().from("contact_mortgage_renewal_calendar_events").upsert(rows, { onConflict: "contact_id,broker" });
  if (error) throw error;
}

export async function deleteBirthdayEventsForContact(contactId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("contact_birthday_calendar_events").select("*").eq("contact_id", contactId);
  if (error) throw error;
  const rows = (data ?? []) as BirthdayCalendarRow[];
  for (const row of rows) {
    if (!row.google_calendar_event_id) continue;
    const connection = await getConnection(row.broker);
    if (!connection) throw new Error(`Google Agenda de ${row.broker} n’est plus connecté.`);
    await deleteGoogleEvent(connection, row.google_calendar_event_id);
  }
  const result = await admin.from("contact_birthday_calendar_events").delete().eq("contact_id", contactId);
  if (result.error) throw result.error;
}

export async function queueContactBirthdays(contactId: string) {
  const rows = CONTACT_BROKERS.map((broker) => ({ contact_id: contactId, broker, sync_status: "pending" as const, last_error: null }));
  const { error } = await getSupabaseAdmin().from("contact_birthday_calendar_events").upsert(rows, { onConflict: "contact_id,broker" });
  if (error) throw error;
}

async function updateContactCalendarState(
  contactId: string,
  values: Record<string, unknown>,
) {
  const { data, error } = await getSupabaseAdmin()
    .from("contacts")
    .update(values)
    .eq("id", contactId)
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return data as ServerContactRow;
}

function calendarFailureMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 240)
    : "Erreur Google Agenda inconnue.";
}

export async function syncContactFollowUp(contactId: string): Promise<CalendarSyncResult> {
  const { data, error } = await getSupabaseAdmin()
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .single();
  if (error) {
    throw error;
  }

  let contact = data as ServerContactRow;
  try {
    const mustRemoveOldEvent = Boolean(
      contact.google_calendar_event_id &&
        contact.google_calendar_event_broker &&
        (!contact.next_follow_up_date ||
          contact.broker === "unassigned" ||
          contact.broker !== contact.google_calendar_event_broker),
    );

    if (mustRemoveOldEvent) {
      const oldBroker = contact.google_calendar_event_broker!;
      const oldConnection = await getConnection(oldBroker);
      if (!oldConnection) {
        throw new Error(`Google Agenda de ${oldBroker} n’est plus connecté.`);
      }
      await deleteGoogleEvent(oldConnection, contact.google_calendar_event_id!);
      contact = await updateContactCalendarState(contact.id, {
        google_calendar_event_id: null,
        google_calendar_event_broker: null,
        google_calendar_sync_status: "pending",
        google_calendar_last_error: null,
      });
    }

    if (!contact.next_follow_up_date) {
      contact = await updateContactCalendarState(contact.id, {
        google_calendar_event_id: null,
        google_calendar_event_broker: null,
        google_calendar_sync_status: "synced",
        google_calendar_last_error: null,
      });
      return {
        status: "synced",
        message: "Aucune relance programmée dans Google Agenda.",
        contact: mapServerContact(contact),
      };
    }

    if (contact.broker === "unassigned") {
      contact = await updateContactCalendarState(contact.id, {
        google_calendar_sync_status: "pending",
        google_calendar_last_error: "Le contact doit être attribué à un courtier.",
      });
      return {
        status: "pending",
        message: "Relance enregistrée dans le CRM · contact non attribué.",
        contact: mapServerContact(contact),
      };
    }

    const broker = contact.broker as CalendarBroker;
    const connection = await getConnection(broker);
    if (!connection) {
      contact = await updateContactCalendarState(contact.id, {
        google_calendar_event_id: null,
        google_calendar_event_broker: null,
        google_calendar_sync_status: "pending",
        google_calendar_last_error: "Google Agenda non connecté.",
      });
      return {
        status: "pending",
        message: "Relance enregistrée dans le CRM · Google Agenda non connecté.",
        contact: mapServerContact(contact),
      };
    }

    const eventExists = Boolean(
      contact.google_calendar_event_id &&
        contact.google_calendar_event_broker === broker,
    );
    const eventId = eventExists
      ? contact.google_calendar_event_id!
      : createGoogleEventId();

    if (!eventExists) {
      contact = await updateContactCalendarState(contact.id, {
        google_calendar_event_id: eventId,
        google_calendar_event_broker: broker,
        google_calendar_sync_status: "pending",
        google_calendar_last_error: null,
      });
    }

    await upsertGoogleEvent(connection, contact, eventId, eventExists);
    contact = await updateContactCalendarState(contact.id, {
      google_calendar_event_id: eventId,
      google_calendar_event_broker: broker,
      google_calendar_sync_status: "synced",
      google_calendar_last_error: null,
    });

    return {
      status: "synced",
      message: "Relance synchronisée avec Google Agenda.",
      contact: mapServerContact(contact),
    };
  } catch (caughtError) {
    const failure = calendarFailureMessage(caughtError);
    contact = await updateContactCalendarState(contact.id, {
      google_calendar_sync_status: "error",
      google_calendar_last_error: failure,
    });
    return {
      status: "error",
      message: "Relance enregistrée · synchronisation Google Agenda impossible.",
      contact: mapServerContact(contact),
    };
  }
}

export async function syncContactsFollowUps(contactIds: ReadonlyArray<string>) {
  const results: CalendarSyncResult[] = [];
  for (const contactId of [...new Set(contactIds)]) {
    results.push(await syncContactFollowUp(contactId));
  }
  return results;
}

export async function exchangeGoogleAuthorizationCode(
  code: string,
  redirectUri: string,
) {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) {
    throw new Error(`Échange OAuth refusé (${response.status}).`);
  }
  return (await response.json()) as GoogleTokenResponse;
}

export async function saveGoogleConnection(
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
  const userInfo = (await userInfoResponse.json()) as { email?: string };
  if (!userInfo.email) {
    throw new Error("Le compte Google n’a retourné aucune adresse courriel.");
  }

  const existingConnection = await getConnection(broker);
  const refreshToken = tokens.refresh_token
    ? tokens.refresh_token
    : existingConnection
      ? await decryptGoogleToken(existingConnection.encrypted_refresh_token)
      : null;
  if (!refreshToken) {
    throw new Error("Google n’a retourné aucun jeton de renouvellement.");
  }

  const { error } = await getSupabaseAdmin()
    .from("google_calendar_connections")
    .upsert({
      broker,
      google_account_email: userInfo.email,
      calendar_id: "primary",
      encrypted_access_token: await encryptGoogleToken(tokens.access_token),
      encrypted_refresh_token: await encryptGoogleToken(refreshToken),
      access_token_expires_at: new Date(
        Date.now() + tokens.expires_in * 1000,
      ).toISOString(),
      scopes: [...new Set([
        ...(existingConnection?.scopes ?? []),
        ...(tokens.scope?.split(" ").filter(Boolean) ?? []),
      ])],
    });
  if (error) {
    throw error;
  }

  const { data: contacts, error: contactsError } = await getSupabaseAdmin()
    .from("contacts")
    .select("id")
    .eq("broker", broker)
    .not("next_follow_up_date", "is", null);
  if (contactsError) {
    throw contactsError;
  }
  await syncContactsFollowUps(
    ((contacts ?? []) as Array<{ id: string }>).map((contact) => contact.id),
  );
  for (;;) {
    const result = await syncContactBirthdays({ broker, limit: 50, retryErrors: false });
    if (result.processed < 50 || result.synced + result.error === 0) break;
  }
  for (;;) {
    const result = await syncContactMortgageRenewals({ broker, limit: 50, retryErrors: false });
    if (result.processed < 50 || result.synced + result.error === 0) break;
  }
}

export async function listGoogleConnectionStatuses(): Promise<CalendarConnectionStatus[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("google_calendar_connections")
    .select("broker, google_account_email, scopes");
  if (error) {
    throw error;
  }
  const connections = new Map(
    ((data ?? []) as Array<{
      broker: CalendarBroker;
      google_account_email: string;
      scopes: string[];
    }>).map((connection) => [connection.broker, connection]),
  );
  const { data: birthdayRows, error: birthdayError } = await getSupabaseAdmin()
    .from("contact_birthday_calendar_events")
    .select("broker, sync_status");
  if (birthdayError) throw birthdayError;
  const { data: mortgageRows, error: mortgageError } = await getSupabaseAdmin()
    .from("contact_mortgage_renewal_calendar_events")
    .select("broker, sync_status");
  if (mortgageError) throw mortgageError;
  const { data: watchRows, error: watchError } = await getSupabaseAdmin()
    .from("google_calendar_watch_channels")
    .select("*");
  if (watchError) {
    console.warn("Statut des notifications Google Calendar indisponible:", watchError.message);
  }
  const watches = new Map(
    ((watchRows ?? []) as GoogleCalendarWatchRow[]).map((row) => [row.broker, row]),
  );
  return (["france", "maxime", "sandrine"] as const).map((broker) => ({
    broker,
    connected: connections.has(broker),
    email: connections.get(broker)?.google_account_email ?? null,
    gmailSendEnabled: connections.get(broker)?.scopes?.includes("https://www.googleapis.com/auth/gmail.send") ?? false,
    birthdays: ((birthdayRows ?? []) as Array<{ broker: CalendarBroker; sync_status: Contact["googleCalendarSyncStatus"] }>)
      .filter((row) => row.broker === broker)
      .reduce((counts, row) => ({ ...counts, [row.sync_status]: counts[row.sync_status] + 1 }), { synced: 0, pending: 0, error: 0 }),
    mortgageRenewals: ((mortgageRows ?? []) as Array<{ broker: CalendarBroker; sync_status: Contact["googleCalendarSyncStatus"] }>)
      .filter((row) => row.broker === broker)
      .reduce((counts, row) => ({ ...counts, [row.sync_status]: counts[row.sync_status] + 1 }), { synced: 0, pending: 0, error: 0 }),
    watch: watchState(watches.get(broker) ?? null),
  }));
}

export async function disconnectGoogleCalendar(broker: CalendarBroker) {
  const connection = await getConnection(broker);
  if (!connection) {
    return;
  }

  await stopGoogleCalendarWatch(broker);

  const { data, error } = await getSupabaseAdmin()
    .from("contacts")
    .select("id, google_calendar_event_id")
    .eq("google_calendar_event_broker", broker)
    .not("google_calendar_event_id", "is", null);
  if (error) {
    throw error;
  }

  for (const contact of (data ?? []) as Array<{
    id: string;
    google_calendar_event_id: string;
  }>) {
    await deleteGoogleEvent(connection, contact.google_calendar_event_id);
  }

  const { data: birthdayRows, error: birthdayError } = await getSupabaseAdmin()
    .from("contact_birthday_calendar_events")
    .select("contact_id, google_calendar_event_id")
    .eq("broker", broker);
  if (birthdayError) throw birthdayError;
  for (const row of (birthdayRows ?? []) as Array<{ contact_id: string; google_calendar_event_id: string | null }>) {
    if (row.google_calendar_event_id) await deleteGoogleEvent(connection, row.google_calendar_event_id);
  }
  const { error: birthdayUpdateError } = await getSupabaseAdmin()
    .from("contact_birthday_calendar_events")
    .update({ google_calendar_event_id: null, synced_birth_date: null, sync_status: "pending", last_error: "Google Agenda non connecté." })
    .eq("broker", broker);
  if (birthdayUpdateError) throw birthdayUpdateError;

  const { data: mortgageRows, error: mortgageError } = await getSupabaseAdmin()
    .from("contact_mortgage_renewal_calendar_events")
    .select("contact_id, google_calendar_event_id")
    .eq("broker", broker);
  if (mortgageError) throw mortgageError;
  for (const row of (mortgageRows ?? []) as Array<{ contact_id: string; google_calendar_event_id: string | null }>) {
    if (row.google_calendar_event_id) await deleteGoogleEvent(connection, row.google_calendar_event_id);
  }
  const { error: mortgageUpdateError } = await getSupabaseAdmin()
    .from("contact_mortgage_renewal_calendar_events")
    .update({
      google_calendar_event_id: null,
      synced_mortgage_renewal_date: null,
      sync_status: "pending",
      last_error: "Google Agenda non connecté.",
    })
    .eq("broker", broker);
  if (mortgageUpdateError) throw mortgageUpdateError;

  const { error: contactsUpdateError } = await getSupabaseAdmin()
    .from("contacts")
    .update({
      google_calendar_event_id: null,
      google_calendar_event_broker: null,
      google_calendar_sync_status: "pending",
      google_calendar_last_error: "Google Agenda non connecté.",
    })
    .eq("google_calendar_event_broker", broker);
  if (contactsUpdateError) {
    throw contactsUpdateError;
  }

  const refreshToken = await decryptGoogleToken(connection.encrypted_refresh_token);
  const { error: deleteError } = await getSupabaseAdmin()
    .from("google_calendar_connections")
    .delete()
    .eq("broker", broker);
  if (deleteError) {
    throw deleteError;
  }

  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
  }).catch(() => undefined);
}
