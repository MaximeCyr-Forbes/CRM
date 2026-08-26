import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TransactionDeadline } from "../../data/transaction-types";
import { getNextTransactionDeadline } from "../../data/transaction-types";
import type { TransactionDeadlineRow, TransactionRow } from "./server-service";
import {
  currentTorontoDateTime,
  isTransactionDeadlineOverdue,
  normalizeTransactionDeadlineTime,
  parseTransactionDeadlineTimeInput,
} from "./deadline-time";
import { buildDeadlineEventPayload } from "../google-calendar/service";

function deadline(values: Partial<TransactionDeadline> = {}): TransactionDeadline {
  return {
    id: "deadline-1",
    transactionId: "transaction-1",
    title: "Inspection",
    dueDate: "2026-08-21",
    dueTime: null,
    completed: false,
    googleCalendarEventId: null,
    googleCalendarEventBroker: null,
    googleCalendarSyncStatus: "synced",
    googleCalendarLastError: null,
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-20T12:00:00.000Z",
    ...values,
  };
}

function row(dueDate: string, dueTime: string | null): TransactionDeadlineRow {
  return {
    id: "deadline-1",
    transaction_id: "transaction-1",
    title: "Inspection",
    due_date: dueDate,
    due_time: dueTime,
    completed: false,
    google_calendar_event_id: "google-event-1",
    google_calendar_event_broker: "maxime",
    google_calendar_sync_status: "synced",
    google_calendar_last_error: null,
    created_at: "2026-08-20T12:00:00.000Z",
    updated_at: "2026-08-20T12:00:00.000Z",
  };
}

const transaction = {
  id: "transaction-1",
  address: "123 rue Test, Montréal",
} as TransactionRow;

describe("heure des échéances de transaction", () => {
  it("normalise le format SQL et valide strictement HH:mm", () => {
    expect(normalizeTransactionDeadlineTime("13:30:00")).toBe("13:30");
    expect(normalizeTransactionDeadlineTime("09:05")).toBe("09:05");
    expect(parseTransactionDeadlineTimeInput(undefined)).toEqual({ valid: true, value: undefined });
    expect(parseTransactionDeadlineTimeInput(null)).toEqual({ valid: true, value: null });
    expect(parseTransactionDeadlineTimeInput("")).toEqual({ valid: true, value: null });
    expect(parseTransactionDeadlineTimeInput("23:59")).toEqual({ valid: true, value: "23:59" });
    expect(parseTransactionDeadlineTimeInput("24:00")).toEqual({ valid: false });
    expect(parseTransactionDeadlineTimeInput("9:05")).toEqual({ valid: false });
    expect(parseTransactionDeadlineTimeInput("09:05:00")).toEqual({ valid: false });
  });

  it("trie par date puis heure, avec les échéances sans heure en premier", () => {
    const next = getNextTransactionDeadline({ deadlines: [
      deadline({ id: "timed-late", dueTime: "16:00" }),
      deadline({ id: "next-day", dueDate: "2026-08-22", dueTime: null }),
      deadline({ id: "all-day", dueTime: null }),
      deadline({ id: "timed-early", dueTime: "09:00" }),
    ] });
    expect(next?.id).toBe("all-day");
  });

  it("évalue le retard selon l’heure locale de Toronto", () => {
    const summerNow = new Date("2026-07-15T14:30:00.000Z"); // 10 h 30 à Toronto
    expect(currentTorontoDateTime(summerNow)).toEqual({ date: "2026-07-15", time: "10:30" });
    expect(isTransactionDeadlineOverdue(deadline({ dueDate: "2026-07-15", dueTime: "10:00" }), summerNow)).toBe(true);
    expect(isTransactionDeadlineOverdue(deadline({ dueDate: "2026-07-15", dueTime: "11:00" }), summerNow)).toBe(false);
    expect(isTransactionDeadlineOverdue(deadline({ dueDate: "2026-07-15", dueTime: null }), summerNow)).toBe(false);
    const winterNow = new Date("2026-01-15T15:30:00.000Z"); // 10 h 30 à Toronto
    expect(currentTorontoDateTime(winterNow)).toEqual({ date: "2026-01-15", time: "10:30" });
  });

  it("conserve les anciennes échéances comme événements toute la journée", () => {
    const payload = buildDeadlineEventPayload(transaction, row("2026-08-21", null), "google-event-1");
    expect(payload).toMatchObject({
      id: "google-event-1",
      start: { date: "2026-08-21" },
      end: { date: "2026-08-22" },
    });
    expect(payload.start.dateTime).toBeUndefined();
  });

  it.each([
    ["été", "2026-07-15"],
    ["hiver", "2026-01-15"],
  ])("crée un événement horaire Google en %s avec un fuseau explicite", (_season, dueDate) => {
    const payload = buildDeadlineEventPayload(transaction, row(dueDate, "13:30:00"), "google-event-1");
    expect(payload).toMatchObject({
      id: "google-event-1",
      start: { dateTime: `${dueDate}T13:30:00`, timeZone: "America/Toronto" },
      end: { dateTime: `${dueDate}T14:30:00`, timeZone: "America/Toronto" },
    });
    expect(payload.start.date).toBeUndefined();
  });

  it("fait passer correctement la fin de l’événement au jour suivant", () => {
    const payload = buildDeadlineEventPayload(transaction, row("2026-08-21", "23:30"));
    expect(payload.end).toEqual({
      dateTime: "2026-08-22T00:30:00",
      timeZone: "America/Toronto",
    });
  });

  it("conserve le même identifiant lors des passages all-day vers timed puis all-day", () => {
    const eventId = "google-event-stable";
    const allDay = buildDeadlineEventPayload(transaction, row("2026-08-26", null), eventId);
    const timed = buildDeadlineEventPayload(transaction, row("2026-08-26", "13:00"), eventId);
    const moved = buildDeadlineEventPayload(transaction, row("2026-08-27", "15:30"), eventId);
    const backToAllDay = buildDeadlineEventPayload(transaction, row("2026-08-27", null), eventId);
    expect([allDay.id, timed.id, moved.id, backToAllDay.id]).toEqual([
      eventId,
      eventId,
      eventId,
      eventId,
    ]);
    expect(allDay.start).toEqual({ date: "2026-08-26" });
    expect(timed.start).toEqual({ dateTime: "2026-08-26T13:00:00", timeZone: "America/Toronto" });
    expect(moved.start).toEqual({ dateTime: "2026-08-27T15:30:00", timeZone: "America/Toronto" });
    expect(backToAllDay.start).toEqual({ date: "2026-08-27" });
  });

  it("expose le champ heure dans l’interface et ne synchronise que sur demande ou événement existant", () => {
    const page = readFileSync("app/transactions/[transactionId]/page.tsx", "utf8");
    const route = readFileSync("app/api/transactions/route.ts", "utf8");
    expect(page).toContain('type="time"');
    expect(page).toContain("initial?.dueTime ?? \"\"");
    expect(page).toContain("dueTime: dueTime || null");
    expect(route).toContain("syncToGoogle ? await syncTransactionDeadline(deadlineId) : null");
    expect(route).toContain("body.syncToGoogle === true || Boolean(existing.google_calendar_event_id)");
    expect(readFileSync("app/lib/google-calendar/service.ts", "utf8")).toContain('method: "PUT"');
  });

  it("déclare une migration additive nullable sans mise à jour de données", () => {
    const migration = readFileSync("supabase/migrations/20260826110000_add_transaction_deadline_time.sql", "utf8");
    const schema = readFileSync("supabase/schema.sql", "utf8");
    expect(migration).toContain("add column if not exists due_time time without time zone");
    expect(migration.toLowerCase()).not.toContain("update public.transaction_deadlines");
    expect(schema).toContain("due_time time without time zone");
  });
});
