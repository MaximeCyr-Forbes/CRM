import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ access: true, sameOrigin: true }));
const ensureWatch = vi.hoisted(() => vi.fn(async () => ({
  changeVersion: 0, lastNotificationAt: null, watchActive: true,
  expiresAt: "2026-08-28T18:00:00.000Z",
})));
vi.mock("../../../../lib/crm-access", () => ({
  requireApiAccess: vi.fn(async () => state.access ? { response: null } : { response: Response.json({}, { status: 401 }) }),
}));
vi.mock("../../../../lib/google-calendar/config", () => ({ isSameOriginRequest: vi.fn(() => state.sameOrigin) }));
vi.mock("../../../../lib/google-calendar/service", () => ({ ensureGoogleCalendarWatch: ensureWatch }));

import { POST } from "./route";

const request = (broker = "maxime") => new Request("https://crm.example/api/calendar/watch/ensure", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "https://crm.example" },
  body: JSON.stringify({ broker }),
});

describe("POST ensure watch", () => {
  beforeEach(() => { state.access = true; state.sameOrigin = true; ensureWatch.mockClear(); });

  it("protège l’action, valide l’origine et assure le canal", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(ensureWatch).toHaveBeenCalledWith("maxime");
    state.sameOrigin = false;
    expect((await POST(request())).status).toBe(403);
    state.sameOrigin = true;
    expect((await POST(request("unassigned"))).status).toBe(400);
    state.access = false;
    expect((await POST(request())).status).toBe(401);
  });
});
