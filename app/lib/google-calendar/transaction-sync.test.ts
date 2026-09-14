import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionDeadlineRow, TransactionRow } from "../transactions/server-service";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), connection: vi.fn(), http: vi.fn() }));
vi.mock("../supabase/server", () => ({ getSupabaseAdmin: mocks.admin }));
vi.mock("../google/connection", () => ({ getGoogleConnection: mocks.connection, googleAuthenticatedRequest: mocks.http }));
import { buildDeadlineEventPayload, deleteCalendarEventForTransactionDeadline, syncTransactionDeadline } from "./service";

const id = "00000000-0000-4000-8000-000000000001";
let deadline: TransactionDeadlineRow;
let transaction: TransactionRow;
let events: Map<string, Record<string, unknown>>;
let failSave = false;
beforeEach(() => {
  vi.resetAllMocks(); failSave = false; events = new Map();
  transaction = { id: "transaction", broker: "france", address: "300 rue Test" } as TransactionRow;
  deadline = { id, transaction_id: transaction.id, title: "Inspection", due_date: "2026-09-15", due_time: "10:00", completed: false,
    source_type: "oaciq", source_form: "PA", source_section: "8.1", source_document: "PA-synthetique.pdf", source_text: "PRIVATE CLAUSE",
    google_calendar_event_id: null, google_calendar_event_broker: null, google_calendar_sync_status: "pending" } as TransactionDeadlineRow;
  mocks.connection.mockImplementation(async broker => ({ broker, calendar_id: "primary" }));
  mocks.admin.mockReturnValue({ from: (table: string) => {
    let patch: Record<string, unknown> | undefined;
    const execute = () => {
      if (patch && failSave && patch.google_calendar_sync_status === "synced") { failSave = false; return { data: null, error: new Error("DB unavailable") }; }
      if (patch) Object.assign(deadline, patch);
      return { data: structuredClone(table === "transactions" ? transaction : deadline), error: null };
    };
    const query = { select: () => query, eq: () => query, update: (value: Record<string, unknown>) => { patch = value; return query; },
      single: async () => execute(), then: (resolve: (value: unknown) => void) => Promise.resolve(execute()).then(resolve) };
    return query;
  } });
  mocks.http.mockImplementation(async (_connection, url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const eventId = body?.id ?? url.split("/").at(-1)!;
    if (init.method === "DELETE") { const found = events.delete(eventId); return new Response(null, { status: found ? 204 : 404 }); }
    if (init.method === "POST" && events.has(eventId)) return new Response(null, { status: 409 });
    if (init.method === "PUT" && !events.has(eventId)) return new Response(null, { status: 404 });
    events.set(eventId, body); return new Response("{}", { status: 200 });
  });
});

describe("transaction Google sync, server authority and idempotency", () => {
  it("uses transaction France, preserves the event ID on update, and deletes with 404 tolerance", async () => {
    expect((await syncTransactionDeadline(id)).status).toBe("synced");
    expect(mocks.connection).toHaveBeenCalledWith("france");
    const eventId = deadline.google_calendar_event_id;
    deadline.due_time = "13:30";
    await syncTransactionDeadline(id);
    expect(deadline.google_calendar_event_id).toBe(eventId);
    expect(events.size).toBe(1);
    expect(events.get(eventId!)?.start).toMatchObject({ dateTime: "2026-09-15T13:30:00" });
    await deleteCalendarEventForTransactionDeadline(deadline);
    await deleteCalendarEventForTransactionDeadline(deadline);
    expect(events.size).toBe(0);
  });
  it("concurrent creates and ten retries still correspond to one Google event", async () => {
    await Promise.all([syncTransactionDeadline(id), syncTransactionDeadline(id)]);
    for (let i = 0; i < 10; i++) await syncTransactionDeadline(id);
    expect(events.size).toBe(1);
    expect(deadline.google_calendar_event_id).toBe(`d${id.replace(/-/g, "")}`);
  });
  it("retries after Google succeeds but the DB save fails without duplication", async () => {
    failSave = true;
    expect((await syncTransactionDeadline(id)).status).toBe("error");
    expect(deadline.google_calendar_event_id).toBeNull();
    expect(events.size).toBe(1);
    expect((await syncTransactionDeadline(id)).status).toBe("synced");
    expect(events.size).toBe(1);
  });
  it("keeps a failed first attempt internal with no Google ID", async () => {
    mocks.http.mockResolvedValue(new Response(null, { status: 503 }));
    expect((await syncTransactionDeadline(id)).status).toBe("error");
    expect(deadline.google_calendar_event_id).toBeNull();
    expect(deadline.google_calendar_sync_status).toBe("error");
  });
  it("keeps disconnected deadlines pending without losing the CRM row", async () => {
    mocks.connection.mockResolvedValue(null);
    expect((await syncTransactionDeadline(id)).status).toBe("pending");
    expect(deadline.google_calendar_event_id).toBeNull();
    expect(deadline.id).toBe(id);
    expect(mocks.http).not.toHaveBeenCalled();
  });
  it("all-day payload contains source metadata but no full clause", () => {
    const payload = buildDeadlineEventPayload(transaction, { ...deadline, due_time: null });
    expect(payload.start).toEqual({ date: "2026-09-15" });
    expect(payload.end).toEqual({ date: "2026-09-16" });
    expect(payload.description).toContain("PA · 8.1");
    expect(payload.description).not.toContain("PRIVATE CLAUSE");
  });
});
