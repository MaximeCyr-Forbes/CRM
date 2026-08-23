import { CONTACT_BROKERS, type CalendarSyncStatus, type Contact, type ContactBroker } from "./contact-types";

export type CalendarBroker = Exclude<ContactBroker, "unassigned">;

export type CalendarWatchState = {
  changeVersion: number;
  lastNotificationAt: string | null;
  watchActive: boolean;
  expiresAt: string | null;
};

export type CalendarConnectionStatus = {
  broker: CalendarBroker;
  connected: boolean;
  email: string | null;
  gmailSendEnabled: boolean;
  birthdays: { synced: number; pending: number; error: number };
  mortgageRenewals: { synced: number; pending: number; error: number };
  watch: CalendarWatchState;
};

export type BirthdaySyncSummary = {
  synced: number;
  pending: number;
  error: number;
  processed: number;
};

export type MortgageRenewalSyncSummary = BirthdaySyncSummary;

export type CalendarSyncResult = {
  status: CalendarSyncStatus;
  message: string;
  contact?: Contact;
};

export function isCalendarBroker(value: unknown): value is CalendarBroker {
  return typeof value === "string" && CONTACT_BROKERS.some((broker) => broker === value);
}
