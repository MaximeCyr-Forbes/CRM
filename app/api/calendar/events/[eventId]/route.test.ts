import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CRMCalendarEvent, CRMCalendarEventInput } from "../../../../data/calendar-event-types";

const state = vi.hoisted(() => ({ accessDenied: false, sameOrigin: true, updated: [] as string[], deleted: [] as string[], managed: false }));

vi.mock("../../../../lib/crm-access", () => ({
  requireApiAccess: vi.fn(async () => ({ response: state.accessDenied ? Response.json({ error: "Accès CRM requis." }, { status: 401 }) : null })),
}));
vi.mock("../../../../lib/google-calendar/config", () => ({ isSameOriginRequest: vi.fn(() => state.sameOrigin) }));

const errors = vi.hoisted(() => ({
  ManagedGoogleCalendarEventError: class ManagedGoogleCalendarEventError extends Error {},
  GoogleCalendarEventNotFoundError: class GoogleCalendarEventNotFoundError extends Error {},
  GoogleCalendarNotConnectedError: class GoogleCalendarNotConnectedError extends Error {},
}));

const event: CRMCalendarEvent = {
  id: "event-1", broker: "maxime", title: "Modifié", description: "", location: "",
  start: "2026-08-21T13:00:00.000Z", end: "2026-08-21T14:00:00.000Z", allDay: false,
  htmlLink: null, eventKind: "google", crmLink: null, readOnly: false, recurring: false,
};

vi.mock("../../../../lib/google-calendar/service", () => ({
  ...errors,
  updateGoogleCalendarEvent: vi.fn(async (eventId: string) => {
    if (state.managed) throw new errors.ManagedGoogleCalendarEventError();
    state.updated.push(eventId); return event;
  }),
  deleteGoogleCalendarEvent: vi.fn(async (_broker: string, eventId: string) => {
    if (state.managed) throw new errors.ManagedGoogleCalendarEventError();
    state.deleted.push(eventId);
  }),
}));

import { DELETE, PATCH } from "./route";

const input: CRMCalendarEventInput = {
  broker: "maxime", title: "Modifié", description: "", location: "", allDay: false,
  start: "2026-08-21T13:00:00.000Z", end: "2026-08-21T14:00:00.000Z",
};
const context = { params: Promise.resolve({ eventId: "event-1" }) };

describe("API modification et suppression du calendrier", () => {
  beforeEach(() => { state.accessDenied = false; state.sameOrigin = true; state.managed = false; state.updated = []; state.deleted = []; });

  it("modifie un événement Google normal", async () => {
    const response = await PATCH(new Request("http://localhost/api/calendar/events/event-1", { method: "PATCH", headers: { Origin: "http://localhost" }, body: JSON.stringify(input) }), context);
    expect(response.status).toBe(200);
    expect(state.updated).toEqual(["event-1"]);
  });

  it("supprime un événement Google normal", async () => {
    const response = await DELETE(new Request("http://localhost/api/calendar/events/event-1?broker=maxime", { method: "DELETE", headers: { Origin: "http://localhost" } }), context);
    expect(response.status).toBe(200);
    expect(state.deleted).toEqual(["event-1"]);
  });

  it("refuse côté serveur les événements CRM gérés automatiquement", async () => {
    state.managed = true;
    const patchResponse = await PATCH(new Request("http://localhost/api/calendar/events/event-1", { method: "PATCH", headers: { Origin: "http://localhost" }, body: JSON.stringify(input) }), context);
    const deleteResponse = await DELETE(new Request("http://localhost/api/calendar/events/event-1?broker=maxime", { method: "DELETE", headers: { Origin: "http://localhost" } }), context);
    expect(patchResponse.status).toBe(409);
    expect(deleteResponse.status).toBe(409);
    expect((await patchResponse.json() as { error: string }).error).toBe("Cet événement est géré automatiquement par le CRM.");
  });

  it("protège la session, l’origine et les paramètres", async () => {
    state.accessDenied = true;
    expect((await DELETE(new Request("http://localhost/api/calendar/events/event-1?broker=maxime", { method: "DELETE", headers: { Origin: "http://localhost" } }), context)).status).toBe(401);
    state.accessDenied = false;
    state.sameOrigin = false;
    expect((await DELETE(new Request("http://localhost/api/calendar/events/event-1?broker=maxime", { method: "DELETE", headers: { Origin: "http://evil.test" } }), context)).status).toBe(403);
    state.sameOrigin = true;
    expect((await DELETE(new Request("http://localhost/api/calendar/events/event-1?broker=invalide", { method: "DELETE", headers: { Origin: "http://localhost" } }), context)).status).toBe(400);
  });
});
