import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), sync: vi.fn(), update: vi.fn(), readError: false,
  row: { id: "event", contact_id: "contact", google_event_id: "old-event", google_event_broker: "france", google_calendar_id: "original-calendar", google_sync_status: "pending" } }));
vi.mock("../google-calendar/service", () => ({ deleteCalendarEventForContact: mocks.remove, syncContactFollowUp: mocks.sync }));
vi.mock("../supabase/server", () => ({
  getSupabaseAdmin: () => ({ rpc: mocks.rpc, from: () => {
    const q = { select: () => q, eq: () => q, single: async () => ({ data: mocks.readError ? null : mocks.row, error: mocks.readError ? {} : null }) }; return q;
  } }),
  getSupabaseServiceClient: () => ({ from: () => ({ update: (values: unknown) => { mocks.update(values); const q = { eq: () => q, then: (resolve: (value: unknown) => unknown) => resolve({ error: null }) }; return q; } }) }),
}));
import { completeContactFollowUp, revertContactFollowUp, syncCompletedFollowUp } from "./follow-up-completions";
import { formatFollowUpCompletionTime } from "../../data/contact-follow-up-types";
beforeEach(() => {
  vi.clearAllMocks(); mocks.readError = false; mocks.row.google_sync_status = "pending";
  mocks.rpc.mockResolvedValue({ data: { id: "event", restored: false }, error: null }); mocks.remove.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Real network prohibited"); }));
});
afterEach(() => vi.unstubAllGlobals());
it("Google failure preserves committed completion and allows retry of exactly the captured event", async () => {
  mocks.remove.mockRejectedValueOnce(new Error("Google down"));
  const result = await completeContactFollowUp("contact", "2026-11-20", "2026-11-20T12:00:00Z");
  expect(result.calendarSync.status).toBe("error");
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ google_sync_status: "error" }));
  expect((await syncCompletedFollowUp("contact", "event")).status).toBe("synced");
  expect(mocks.remove).toHaveBeenCalledWith({ googleCalendarEventId: "old-event", googleCalendarEventBroker: "france" }, "original-calendar");
  expect(mocks.sync).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it("SQL failure performs no calendar operation", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: new Error("FOLLOWUP_STALE") });
  await expect(completeContactFollowUp("contact", "2026-11-20", "version")).rejects.toThrow();
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("retry checks scoped access and cannot delete another contact event", async () => {
  mocks.readError = true;
  await expect(syncCompletedFollowUp("other", "event")).rejects.toThrow("FORBIDDEN");
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
});
it("undo with a newer date does not resync or replace it", async () => {
  await revertContactFollowUp("contact", "event"); expect(mocks.sync).not.toHaveBeenCalled();
});
it("undo with restored date uses the existing sync engine", async () => {
  mocks.rpc.mockResolvedValue({ data: { restored: true }, error: null });
  mocks.sync.mockResolvedValue({ status: "synced" });
  await revertContactFollowUp("contact", "event"); expect(mocks.sync).toHaveBeenCalledWith("contact");
});
it("UTC near midnight displays the previous date in Quebec", () => {
  const date = formatFollowUpCompletionTime("2026-11-26T02:12:00Z");
  expect(date).toContain("25 novembre 2026"); expect(date).toMatch(/21\D+12/);
});
