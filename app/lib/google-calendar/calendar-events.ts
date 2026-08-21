import type {
  CRMCalendarEvent,
  CRMCalendarEventInput,
  CRMCalendarEventKind,
} from "../../data/calendar-event-types";
import type { CalendarBroker } from "../../data/calendar-types";

export const CALENDAR_TIME_ZONE = "America/Toronto";
export const CALENDAR_POLL_INTERVAL_MS = 15_000;

export type GoogleCalendarEventResource = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
  recurrence?: string[];
  recurringEventId?: string;
};

const systemKinds = new Set<CRMCalendarEventKind>([
  "birthday",
  "mortgage_renewal",
  "follow_up",
  "transaction_deadline",
]);

function normalizePrivateKind(value: string | undefined): CRMCalendarEventKind | null {
  if (value === "birthday") return "birthday";
  if (value === "mortgage-renewal" || value === "mortgage_renewal") return "mortgage_renewal";
  if (value === "follow-up" || value === "follow_up") return "follow_up";
  if (value === "transaction-deadline" || value === "transaction_deadline") return "transaction_deadline";
  if (value === "crm") return "crm";
  return null;
}

export function classifyGoogleCalendarEvent(event: GoogleCalendarEventResource): CRMCalendarEventKind {
  const privateProperties = event.extendedProperties?.private;
  const explicitKind = normalizePrivateKind(privateProperties?.eventKind);
  if (explicitKind) return explicitKind;
  const description = event.description ?? "";
  const title = event.summary ?? "";
  if (/Relance CRM — Équipe Forbes/i.test(description) || /^Relance client\s*[—-]/i.test(title)) {
    return "follow_up";
  }
  if (/Échéance de transaction — Équipe Forbes/i.test(description)) {
    return "transaction_deadline";
  }
  if (privateProperties?.source === "forbes-crm") return "crm";
  return "google";
}

function isSafeCRMIdentifier(value: string | undefined) {
  return Boolean(value && /^[a-zA-Z0-9_-]{1,128}$/.test(value));
}

export function extractCRMCalendarLink(event: GoogleCalendarEventResource, kind: CRMCalendarEventKind) {
  const privateProperties = event.extendedProperties?.private;
  if (kind === "transaction_deadline" && isSafeCRMIdentifier(privateProperties?.crmTransactionId)) {
    return `/transactions/${privateProperties!.crmTransactionId}`;
  }
  if (
    (kind === "birthday" || kind === "mortgage_renewal" || kind === "follow_up")
    && isSafeCRMIdentifier(privateProperties?.crmContactId)
  ) {
    return `/contacts/${privateProperties!.crmContactId}`;
  }
  const description = event.description ?? "";
  const match = description.match(/Fiche CRM\s*:\s*(?:https?:\/\/[^\s/]+)?\/(contacts|transactions)\/([a-zA-Z0-9_-]{1,128})(?=$|[\s?#])/i);
  return match ? `/${match[1].toLowerCase()}/${match[2]}` : null;
}

export function mapGoogleCalendarEvent(
  event: GoogleCalendarEventResource,
  broker: CalendarBroker,
): CRMCalendarEvent {
  const id = event.id?.trim();
  const start = event.start?.date ?? event.start?.dateTime;
  const end = event.end?.date ?? event.end?.dateTime;
  if (!id || !start || !end) throw new Error("Événement Google incomplet.");
  const eventKind = classifyGoogleCalendarEvent(event);
  const recurring = Boolean(event.recurringEventId || event.recurrence?.length);
  return {
    id,
    broker,
    title: event.summary?.trim() || "Sans titre",
    description: event.description ?? "",
    location: event.location ?? "",
    start,
    end,
    allDay: Boolean(event.start?.date),
    htmlLink: event.htmlLink ?? null,
    eventKind,
    crmLink: extractCRMCalendarLink(event, eventKind),
    readOnly: systemKinds.has(eventKind) || recurring,
    recurring,
  };
}

export function buildGoogleCalendarEventPayload(input: CRMCalendarEventInput) {
  const common = {
    summary: input.title.trim(),
    description: input.description.trim(),
    location: input.location.trim(),
    extendedProperties: {
      private: { source: "forbes-crm", eventKind: "crm", crmBroker: input.broker },
    },
  };
  return input.allDay
    ? { ...common, start: { date: input.start }, end: { date: input.end } }
    : {
        ...common,
        start: { dateTime: input.start, timeZone: CALENDAR_TIME_ZONE },
        end: { dateTime: input.end, timeZone: CALENDAR_TIME_ZONE },
      };
}

export function validateCalendarEventInput(value: unknown): CRMCalendarEventInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<CRMCalendarEventInput>;
  if (
    !["france", "maxime", "sandrine"].includes(input.broker ?? "")
    || typeof input.title !== "string"
    || input.title.trim().length < 1
    || input.title.trim().length > 200
    || typeof input.description !== "string"
    || input.description.length > 8_000
    || typeof input.location !== "string"
    || input.location.length > 500
    || typeof input.allDay !== "boolean"
    || typeof input.start !== "string"
    || typeof input.end !== "string"
  ) return null;
  if (input.allDay) {
    const validDate = (date: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      const timestamp = Date.parse(`${date}T00:00:00.000Z`);
      return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
    };
    if (!validDate(input.start) || !validDate(input.end)) return null;
    if (input.end <= input.start) return null;
  } else {
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(input.start) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(input.end)) return null;
    const start = Date.parse(input.start);
    const end = Date.parse(input.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  }
  return {
    broker: input.broker as CalendarBroker,
    title: input.title.trim(),
    description: input.description.trim(),
    location: input.location.trim(),
    allDay: input.allDay,
    start: input.start,
    end: input.end,
  };
}

export function isManagedCalendarEvent(event: GoogleCalendarEventResource) {
  return systemKinds.has(classifyGoogleCalendarEvent(event));
}
