import { CONTACT_BROKERS, type CalendarSyncStatus, type Contact, type ContactBroker } from "./contact-types";

export type CalendarBroker = Exclude<ContactBroker, "unassigned">;

export type CalendarConnectionStatus = {
  broker: CalendarBroker;
  connected: boolean;
  email: string | null;
  birthdays: { synced: number; pending: number; error: number };
};

export type BirthdaySyncSummary = {
  synced: number;
  pending: number;
  error: number;
  processed: number;
};

export type CalendarSyncResult = {
  status: CalendarSyncStatus;
  message: string;
  contact?: Contact;
};

export function isCalendarBroker(value: unknown): value is CalendarBroker {
  return typeof value === "string" && CONTACT_BROKERS.some((broker) => broker === value);
}
