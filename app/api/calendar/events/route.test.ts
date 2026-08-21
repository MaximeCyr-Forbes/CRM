import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CRMCalendarEvent, CRMCalendarEventInput } from "../../../data/calendar-event-types";

const state = vi.hoisted(() => ({ accessDenied: false, sameOrigin: true, created: [] as CRMCalendarEventInput[] }));

vi.mock("../../../lib/crm-access", () => ({
  requireApiAccess: vi.fn(async () => ({ response: state.accessDenied ? Response.json({ error: "Accès CRM requis." }, { status: 401 }) : null })),
}));
vi.mock("../../../lib/google-calendar/config", () => ({ isSameOriginRequest: vi.fn(() => state.sameOrigin) }));

const event: CRMCalendarEvent = {
  id: "event-1", broker: "maxime", title: "Inspection", description: "", location: "",
  start: "2026-08-21T13:00:00.000Z", end: "2026-08-21T14:00:00.000Z", allDay: false,
  htmlLink: null, eventKind: "google", crmLink: null, readOnly: false, recurring: false,
};

vi.mock("../../../lib/google-calendar/service", () => ({
  GoogleCalendarNotConnectedError: class GoogleCalendarNotConnectedError extends Error {},
  listGoogleCalendarEvents: vi.fn(async () => [event]),
  createGoogleCalendarEvent: vi.fn(async (input: CRMCalendarEventInput) => { state.created.push(input); return { ...event, ...input }; }),
}));

import { GET, POST } from "./route";

const validInput: CRMCalendarEventInput = {
  broker: "maxime", title: "Inspection", description: "", location: "", allDay: false,
  start: "2026-08-21T13:00:00.000Z", end: "2026-08-21T14:00:00.000Z",
};

describe("API liste et création du calendrier", () => {
  beforeEach(() => { state.accessDenied = false; state.sameOrigin = true; state.created = []; });

  it("retourne les événements d’une plage valide", async () => {
    const response = await GET(new Request("http://localhost/api/calendar/events?broker=maxime&start=2026-08-01T04:00:00.000Z&end=2026-09-01T04:00:00.000Z"));
    expect(response.status).toBe(200);
    expect((await response.json() as { data: CRMCalendarEvent[] }).data).toEqual([event]);
  });

  it("crée immédiatement un événement Google validé", async () => {
    const response = await POST(new Request("http://localhost/api/calendar/events", { method: "POST", headers: { Origin: "http://localhost", "Content-Type": "application/json" }, body: JSON.stringify(validInput) }));
    expect(response.status).toBe(201);
    expect(state.created).toEqual([validInput]);
  });

  it("protège la session, l’origine et les entrées", async () => {
    state.accessDenied = true;
    expect((await GET(new Request("http://localhost/api/calendar/events?broker=maxime&start=x&end=y"))).status).toBe(401);
    state.accessDenied = false;
    state.sameOrigin = false;
    expect((await POST(new Request("http://localhost/api/calendar/events", { method: "POST", headers: { Origin: "http://evil.test" }, body: JSON.stringify(validInput) }))).status).toBe(403);
    state.sameOrigin = true;
    expect((await POST(new Request("http://localhost/api/calendar/events", { method: "POST", headers: { Origin: "http://localhost" }, body: JSON.stringify({ ...validInput, title: "" }) }))).status).toBe(400);
    expect((await POST(new Request("http://localhost/api/calendar/events", { method: "POST", headers: { Origin: "http://localhost" }, body: JSON.stringify({ ...validInput, start: "2026-08-21T09:00:00", end: "2026-08-21T10:00:00" }) }))).status).toBe(400);
    expect((await POST(new Request("http://localhost/api/calendar/events", { method: "POST", headers: { Origin: "http://localhost" }, body: JSON.stringify({ ...validInput, allDay: true, start: "2026-99-99", end: "2027-01-01" }) }))).status).toBe(400);
    expect((await GET(new Request("http://localhost/api/calendar/events?broker=invalide&start=x&end=y"))).status).toBe(400);
  });
});
