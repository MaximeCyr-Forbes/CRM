import type { CalendarBroker } from "./calendar-types";

export const CRM_CALENDAR_EVENT_KINDS = [
  "google",
  "crm",
  "follow_up",
  "birthday",
  "mortgage_renewal",
  "transaction_deadline",
] as const;

export type CRMCalendarEventKind = (typeof CRM_CALENDAR_EVENT_KINDS)[number];
export type CRMCalendarEntityKind = "contact" | "listing" | "transaction";

export type CRMCalendarEvent = {
  id: string;
  broker: CalendarBroker;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string | null;
  eventKind: CRMCalendarEventKind;
  crmEntityKind: CRMCalendarEntityKind | null;
  crmEntityId: string | null;
  crmLink: string | null;
  blocksAvailability: boolean;
  readOnly: boolean;
  recurring: boolean;
};

export type CRMCalendarEventInput = {
  broker: CalendarBroker;
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  start: string;
  end: string;
  crmEntityKind?: CRMCalendarEntityKind | null;
  crmEntityId?: string | null;
};

export function calendarEventKey(event: Pick<CRMCalendarEvent, "broker" | "id">) {
  return `${event.broker}:${event.id}`;
}

export const CALENDAR_EVENT_KIND_LABELS: Record<CRMCalendarEventKind, string> = {
  google: "Rendez-vous",
  crm: "Rendez-vous",
  follow_up: "Relance",
  birthday: "Anniversaire",
  mortgage_renewal: "Renouvellement",
  transaction_deadline: "Échéance",
};
