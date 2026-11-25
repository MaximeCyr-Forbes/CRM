import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ member: true, origin: true, complete: vi.fn(), revert: vi.fn(), retry: vi.fn(), history: vi.fn() }));
vi.mock("../../lib/auth/route", () => ({ withCRMIdentity: (handler: unknown) => handler }));
vi.mock("../../lib/auth/context", () => ({ crmMemberContext: { getStore: () => state.member ? { authUserId: "server-identity" } : null } }));
vi.mock("../../lib/google-calendar/config", () => ({ isSameOriginRequest: () => state.origin }));
vi.mock("../../lib/contacts/follow-up-completions", () => ({ completeContactFollowUp: state.complete, revertContactFollowUp: state.revert, syncCompletedFollowUp: state.retry, readFollowUpHistory: state.history }));
import { GET, POST } from "./[contactId]/follow-up-completions/route";
const id = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ contactId: id }) };
const body = { action: "complete", scheduledFor: "2026-11-20", version: "2026-11-20T12:00:00Z" };
const request = (value = body) => new Request("https://crm.test/api/contacts/test/follow-up-completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
beforeEach(() => { vi.resetAllMocks(); state.member = true; state.origin = true; state.complete.mockResolvedValue({ calendarSync: { status: "synced" } }); state.history.mockResolvedValue([]); });
it("ignores browser-supplied identity and broker", async () => {
  expect((await POST(request({ ...body, broker: "france", member_id: "forged" } as any), ctx)).status).toBe(200);
  expect(state.complete).toHaveBeenCalledWith(id, body.scheduledFor, body.version);
});
it("rejects missing authenticated identity and cross-origin mutations", async () => {
  state.member = false; expect((await POST(request(), ctx)).status).toBe(403);
  expect((await GET(request(), ctx)).status).toBe(403);
  state.member = true; state.origin = false; expect((await POST(request(), ctx)).status).toBe(403);
  expect(state.complete).not.toHaveBeenCalled();
});
it("returns a conflict and no false success for a postponed follow-up", async () => {
  state.complete.mockRejectedValue({ message: "FOLLOWUP_STALE" });
  const response = await POST(request(), ctx);
  expect(response.status).toBe(409); expect(await response.json()).toEqual({ error: expect.stringContaining("autre session") });
});
it("returns no-store history and preserves errors", async () => {
  const response = await GET(request(), ctx); expect(response.headers.get("cache-control")).toContain("no-store");
  state.history.mockRejectedValue(new Error("FOLLOWUP_FORBIDDEN")); expect((await GET(request(), ctx)).status).toBe(403);
});
it("rejects malformed inputs", async () => {
  expect((await POST(request({ ...body, scheduledFor: "" }), ctx)).status).toBe(400);
  expect(state.complete).not.toHaveBeenCalled();
});
