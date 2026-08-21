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
  crmLink: string | null;
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
};

export const CALENDAR_EVENT_KIND_LABELS: Record<CRMCalendarEventKind, string> = {
  google: "Rendez-vous",
  crm: "Rendez-vous",
  follow_up: "Relance",
  birthday: "Anniversaire",
  mortgage_renewal: "Renouvellement",
  transaction_deadline: "Échéance",
};
