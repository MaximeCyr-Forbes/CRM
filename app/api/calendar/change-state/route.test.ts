import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ access: true }));
const getWatchState = vi.hoisted(() => vi.fn(async () => ({
  changeVersion: 42,
  lastNotificationAt: "2026-08-21T18:00:00.000Z",
  watchActive: true,
  expiresAt: "2026-08-28T18:00:00.000Z",
})));
vi.mock("../../../lib/crm-access", () => ({
  requireApiAccess: vi.fn(async () => state.access ? { response: null } : { response: Response.json({ error: "Accès CRM requis." }, { status: 401 }) }),
}));
vi.mock("../../../lib/google-calendar/service", () => ({ getGoogleCalendarWatchState: getWatchState }));

import { GET } from "./route";

describe("GET change-state", () => {
  beforeEach(() => { state.access = true; getWatchState.mockClear(); });

  it("retourne uniquement le signal léger sans cache", async () => {
    const response = await GET(new Request("https://crm.example/api/calendar/change-state?broker=maxime"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      changeVersion: 42,
      lastNotificationAt: "2026-08-21T18:00:00.000Z",
      watchActive: true,
      expiresAt: "2026-08-28T18:00:00.000Z",
    });
  });

  it("protège la route et valide le courtier", async () => {
    state.access = false;
    expect((await GET(new Request("https://crm.example/api/calendar/change-state?broker=maxime"))).status).toBe(401);
    state.access = true;
    expect((await GET(new Request("https://crm.example/api/calendar/change-state?broker=unassigned"))).status).toBe(400);
  });
});
