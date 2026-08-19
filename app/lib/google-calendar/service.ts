import type {
  CalendarBroker,
  CalendarConnectionStatus,
  CalendarSyncResult,
  BirthdaySyncSummary,
} from "../../data/calendar-types";
import type { Contact, ContactBroker, ContactSource } from "../../data/contact-types";
import { BROKER_LABELS, CLIENT_TYPE_LABELS, CONTACT_BROKERS, PRIORITY_LABELS, getContactName } from "../../data/contact-types";
import type { TransactionBroker } from "../../data/transaction-types";
import type { TransactionDeadlineRow, TransactionRow } from "../transactions/server-service";
import { getSupabaseAdmin } from "../supabase/server";
import { getGoogleOAuthConfig } from "./config";
import { decryptGoogleToken, encryptGoogleToken } from "./token-crypto";
import { formatBirthDate, normalizeBirthDate } from "../birth-date";

type GoogleConnectionRow = {
  broker: CalendarBroker;
  google_account_email: string;
  calendar_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  access_token_expires_at: string;
  scopes: string[];
};

export type ServerContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  birth_date: string | null;
  civic_number: string;
  address: string;
  apartment: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  broker: ContactBroker;
  client_type: Contact["clientType"];
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
    civicNumber: row.civic_number ?? "",
    address: row.address ?? "",
    apartment: row.apartment ?? "",
    city: row.city ?? "",
    province: row.province ?? "",
    postalCode: row.postal_code ?? "",
    country: row.country ?? "",
    broker: row.broker,
    clientType: row.client_type,
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

async function getConnection(broker: CalendarBroker) {
  const { data, error } = await getSupabaseAdmin()
    .from("google_calendar_connections")
    .select("*")
    .eq("broker", broker)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data as GoogleConnectionRow | null) ?? null;
}

async function refreshAccessToken(connection: GoogleConnectionRow) {
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
  if (!response.ok) {
    throw new Error(`Renouvellement Google refusé (${response.status}).`);
  }

  const tokens = (await response.json()) as GoogleTokenResponse;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const { error } = await getSupabaseAdmin()
    .from("google_calendar_connections")
    .update({
      encrypted_access_token: await encryptGoogleToken(tokens.access_token),
      access_token_expires_at: expiresAt,
    })
    .eq("broker", connection.broker);
  if (error) {
    throw error;
  }

  return tokens.access_token;
}

async function getAccessToken(connection: GoogleConnectionRow, forceRefresh = false) {
  const expiresSoon =
    new Date(connection.access_token_expires_at).getTime() <= Date.now() + 60_000;
  if (forceRefresh || expiresSoon) {
    return refreshAccessToken(connection);
  }
  return decryptGoogleToken(connection.encrypted_access_token);
}

async function googleCalendarRequest(
  connection: GoogleConnectionRow,
  path: string,
  init: RequestInit,
) {
  const send = async (token: string) =>
    fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });

  let response = await send(await getAccessToken(connection));
  if (response.status === 401) {
    response = await send(await getAccessToken(connection, true));
  }
  return response;
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
      scopes: tokens.scope?.split(" ").filter(Boolean) ?? [],
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
}

export async function listGoogleConnectionStatuses(): Promise<CalendarConnectionStatus[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("google_calendar_connections")
    .select("broker, google_account_email");
  if (error) {
    throw error;
  }
  const connections = new Map(
    ((data ?? []) as Array<{
      broker: CalendarBroker;
      google_account_email: string;
    }>).map((connection) => [connection.broker, connection.google_account_email]),
  );
  const { data: birthdayRows, error: birthdayError } = await getSupabaseAdmin()
    .from("contact_birthday_calendar_events")
    .select("broker, sync_status");
  if (birthdayError) throw birthdayError;
  return (["france", "maxime", "sandrine"] as const).map((broker) => ({
    broker,
    connected: connections.has(broker),
    email: connections.get(broker) ?? null,
    birthdays: ((birthdayRows ?? []) as Array<{ broker: CalendarBroker; sync_status: Contact["googleCalendarSyncStatus"] }>)
      .filter((row) => row.broker === broker)
      .reduce((counts, row) => ({ ...counts, [row.sync_status]: counts[row.sync_status] + 1 }), { synced: 0, pending: 0, error: 0 }),
  }));
}

export async function disconnectGoogleCalendar(broker: CalendarBroker) {
  const connection = await getConnection(broker);
  if (!connection) {
    return;
  }

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
