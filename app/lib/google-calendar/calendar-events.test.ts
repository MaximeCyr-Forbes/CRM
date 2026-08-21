import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CRMCalendarEventInput } from "../../data/calendar-event-types";

const state = vi.hoisted(() => ({
  connection: {
    broker: "maxime",
    google_account_email: "maxime@example.ca",
    calendar_id: "primary",
    encrypted_access_token: "encrypted",
    encrypted_refresh_token: "refresh",
    access_token_expires_at: "2099-01-01T00:00:00.000Z",
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  },
}));

vi.mock("../supabase/server", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: state.connection, error: null })) })),
      })),
    })),
  })),
}));

vi.mock("./token-crypto", () => ({
  decryptGoogleToken: vi.fn(async () => "access-token"),
  encryptGoogleToken: vi.fn(async (value: string) => value),
}));

vi.mock("./config", () => ({
  getGoogleOAuthConfig: vi.fn(() => ({ clientId: "client", clientSecret: "secret", stateSecret: "state" })),
}));

import {
  buildGoogleCalendarEventPayload,
  classifyGoogleCalendarEvent,
  mapGoogleCalendarEvent,
} from "./calendar-events";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  listGoogleCalendarEvents,
  ManagedGoogleCalendarEventError,
  updateGoogleCalendarEvent,
} from "./service";

const timed = {
  id: "timed-1",
  summary: "Inspection",
  start: { dateTime: "2026-08-21T09:00:00-04:00" },
  end: { dateTime: "2026-08-21T10:00:00-04:00" },
  htmlLink: "https://calendar.google.com/event?eid=1",
};

const input: CRMCalendarEventInput = {
  broker: "maxime",
  title: "Visite 123 Rue ABC",
  description: "Rencontre client",
  location: "123 Rue ABC",
  allDay: false,
  start: "2026-08-21T13:00:00.000Z",
  end: "2026-08-21T14:00:00.000Z",
};

describe("calendrier Google intégré", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("classe les événements Google et CRM et applique la lecture seule métier", () => {
    const birthday = mapGoogleCalendarEvent({ id: "b", summary: "Anniversaire", start: { date: "2026-08-21" }, end: { date: "2026-08-22" }, extendedProperties: { private: { eventKind: "birthday", crmContactId: "contact-1" } } }, "france");
    const mortgage = mapGoogleCalendarEvent({ id: "m", start: { date: "2026-08-21" }, end: { date: "2026-08-22" }, extendedProperties: { private: { eventKind: "mortgage-renewal", crmContactId: "contact-2" } } }, "france");
    const followUp = mapGoogleCalendarEvent({ id: "f", description: "Relance CRM — Équipe Forbes\nFiche CRM : https://crm.test/contacts/contact-3", start: { date: "2026-08-21" }, end: { date: "2026-08-22" } }, "maxime");
    const deadline = mapGoogleCalendarEvent({ id: "d", description: "Échéance de transaction — Équipe Forbes\nFiche CRM : /transactions/transaction-4", start: { date: "2026-08-21" }, end: { date: "2026-08-22" } }, "sandrine");
    const google = mapGoogleCalendarEvent(timed, "maxime");
    const crm = mapGoogleCalendarEvent({ ...timed, id: "crm", extendedProperties: { private: { source: "forbes-crm", eventKind: "crm" } } }, "maxime");
    const recurring = mapGoogleCalendarEvent({ ...timed, id: "recurring", recurringEventId: "series" }, "maxime");

    expect([birthday.eventKind, mortgage.eventKind, followUp.eventKind, deadline.eventKind, google.eventKind, crm.eventKind])
      .toEqual(["birthday", "mortgage_renewal", "follow_up", "transaction_deadline", "google", "crm"]);
    expect([birthday, mortgage, followUp, deadline].every((event) => event.readOnly)).toBe(true);
    expect(google.readOnly).toBe(false);
    expect(crm.readOnly).toBe(false);
    expect(recurring.readOnly).toBe(true);
    expect(birthday.crmLink).toBe("/contacts/contact-1");
    expect(deadline.crmLink).toBe("/transactions/transaction-4");
  });

  it("charge toutes les pages events.list sans limiter le calendrier à 250 événements", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [timed], nextPageToken: "page-2" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ ...timed, id: "timed-2" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const events = await listGoogleCalendarEvents("maxime", "2026-08-01T04:00:00.000Z", "2026-09-01T04:00:00.000Z");
    expect(events.map((event) => event.id)).toEqual(["timed-1", "timed-2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("singleEvents=true");
    expect(String(fetchMock.mock.calls[0][0])).toContain("orderBy=startTime");
    expect(String(fetchMock.mock.calls[1][0])).toContain("pageToken=page-2");
  });

  it("crée, modifie et supprime les événements normaux avec Google immédiatement", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...timed, id: "created", extendedProperties: { private: { source: "forbes-crm", eventKind: "crm" } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(timed), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...timed, summary: "Modifié" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(timed), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await createGoogleCalendarEvent(input)).id).toBe("created");
    expect((await updateGoogleCalendarEvent("timed-1", input)).title).toBe("Modifié");
    await expect(deleteGoogleCalendarEvent("maxime", "timed-1")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.map((call) => (call[1] as RequestInit).method)).toEqual(["POST", "GET", "PATCH", "GET", "DELETE"]);
  });

  it("protège côté serveur un anniversaire et une relance", async () => {
    const birthday = { ...timed, extendedProperties: { private: { eventKind: "birthday" } } };
    const followUp = { ...timed, description: "Relance CRM — Équipe Forbes" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(birthday), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(followUp), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(updateGoogleCalendarEvent("birthday", input)).rejects.toBeInstanceOf(ManagedGoogleCalendarEventError);
    await expect(deleteGoogleCalendarEvent("maxime", "follow-up")).rejects.toBeInstanceOf(ManagedGoogleCalendarEventError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("construit correctement une journée entière avec fin Google exclusive", () => {
    const payload = buildGoogleCalendarEventPayload({ ...input, allDay: true, start: "2026-08-21", end: "2026-08-22" });
    expect(payload.start).toEqual({ date: "2026-08-21" });
    expect(payload.end).toEqual({ date: "2026-08-22" });
    expect(payload.extendedProperties.private).toEqual({ source: "forbes-crm", eventKind: "crm", crmBroker: "maxime" });
  });

  it("reconnaît les marqueurs sans transformer une URL externe en lien CRM", () => {
    expect(classifyGoogleCalendarEvent({ description: "Relance CRM — Équipe Forbes" })).toBe("follow_up");
    expect(mapGoogleCalendarEvent({ ...timed, description: "Voir https://example.com/contacts/contact-1/extra" }, "maxime").crmLink).toBeNull();
  });
});
