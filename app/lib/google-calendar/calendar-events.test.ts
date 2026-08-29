import { beforeEach, describe, expect, it, vi } from "vitest";
import { calendarEventKey, type CRMCalendarEventInput } from "../../data/calendar-event-types";
import { GOOGLE_CALENDAR_LIST_READONLY_SCOPE } from "./scopes";
import { eventCalendarTime } from "./calendar-date";

const state = vi.hoisted(() => ({
  connection: {
    broker: "maxime" as const,
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
  listGoogleCalendars,
  listGoogleCalendarEvents,
  listGoogleCalendarEventsWithMeta,
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
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    state.connection.scopes = ["https://www.googleapis.com/auth/calendar.events"];
  });

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
    expect([birthday.blocksAvailability, followUp.blocksAvailability]).toEqual([false, false]);
    expect(mapGoogleCalendarEvent({ ...timed, transparency: "transparent" }, "maxime").blocksAvailability).toBe(false);
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

  it("découvre le calendrier Centris exact par nom normalisé dans toutes les pages CalendarList", async () => {
    state.connection.scopes = ["https://www.googleapis.com/auth/calendar.events", GOOGLE_CALENDAR_LIST_READONLY_SCOPE];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "other", summary: "Centris" }], nextPageToken: "page-2" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "centris-id", summary: "  CENTRIS   ZONE SHOWINGS  " }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const calendars = await listGoogleCalendars(state.connection);
    expect(calendars.map((calendar) => calendar.id)).toEqual(["other", "centris-id"]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("users/me/calendarList");
    expect(String(fetchMock.mock.calls[1][0])).toContain("pageToken=page-2");
  });

  it("fusionne les événements principal et Centris sans collision d’identifiants", async () => {
    state.connection.scopes = ["https://www.googleapis.com/auth/calendar.events", GOOGLE_CALENDAR_LIST_READONLY_SCOPE];
    const primaryItems = Array.from({ length: 5 }, (_, index) => ({ ...timed, id: index === 0 ? "shared" : `primary-${index}` }));
    const centrisItems = Array.from({ length: 3 }, (_, index) => ({ ...timed, id: index === 0 ? "shared" : `centris-${index}`, summary: `Visite ${index}` }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: primaryItems }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [
        { id: "wrong", summary: "Centris Zone" },
        { id: "centris-calendar", summary: "Centris Zone Showings" },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: centrisItems }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listGoogleCalendarEventsWithMeta("maxime", "2026-08-01T04:00:00.000Z", "2026-09-01T04:00:00.000Z");
    expect(result.centrisShowingsStatus).toBe("synchronized");
    expect(result.events).toHaveLength(8);
    expect(new Set(result.events.map(calendarEventKey)).size).toBe(8);
    const centris = result.events.filter((event) => event.eventKind === "centris_showing");
    expect(centris).toHaveLength(3);
    expect(centris[0]).toMatchObject({
      sourceCalendarId: "centris-calendar",
      sourceCalendarName: "Centris Zone Showings",
      readOnly: true,
      blocksAvailability: true,
      crmLink: null,
    });
    expect(String(fetchMock.mock.calls[2][0])).toContain("calendars/centris-calendar/events");
  });

  it("préserve les visites toute la journée, les heures exactes et la transparence Google", () => {
    const source = { id: "centris-calendar", name: "Centris Zone Showings", eventKind: "centris_showing" as const };
    const timedShowing = mapGoogleCalendarEvent({
      ...timed,
      start: { dateTime: "2026-08-21T10:00:00-04:00" },
      end: { dateTime: "2026-08-21T14:25:00-04:00" },
      transparency: "transparent",
    }, "maxime", source);
    const allDayShowing = mapGoogleCalendarEvent({ id: "all-day", start: { date: "2026-08-21" }, end: { date: "2026-08-22" } }, "maxime", source);
    expect(timedShowing).toMatchObject({
      start: "2026-08-21T10:00:00-04:00",
      end: "2026-08-21T14:25:00-04:00",
      allDay: false,
      blocksAvailability: false,
      readOnly: true,
    });
    expect([eventCalendarTime(timedShowing, "start"), eventCalendarTime(timedShowing, "end")]).toEqual(["10 h 00", "14 h 25"]);
    expect(allDayShowing).toMatchObject({ start: "2026-08-21", end: "2026-08-22", allDay: true, readOnly: true });
  });

  it("retourne quand même le calendrier principal si CalendarList ou Centris échoue", async () => {
    state.connection.scopes = ["https://www.googleapis.com/auth/calendar.events", GOOGLE_CALENDAR_LIST_READONLY_SCOPE];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [timed] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("indisponible", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await listGoogleCalendarEventsWithMeta("maxime", "2026-08-01T04:00:00.000Z", "2026-09-01T04:00:00.000Z");
    expect(result).toMatchObject({ centrisShowingsStatus: "unavailable" });
    expect(result.events.map((event) => event.id)).toEqual(["timed-1"]);
  });

  it("retourne le calendrier principal sans erreur lorsque Centris est absent", async () => {
    state.connection.scopes = ["https://www.googleapis.com/auth/calendar.events", GOOGLE_CALENDAR_LIST_READONLY_SCOPE];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [timed] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [
        { id: "primary", summary: "Principal" },
        { id: "holidays", summary: "Jours fériés" },
        { id: "prospects", summary: "Prospects" },
      ] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await listGoogleCalendarEventsWithMeta("maxime", "2026-08-01T04:00:00.000Z", "2026-09-01T04:00:00.000Z");
    expect(result).toMatchObject({ centrisShowingsStatus: "not_detected" });
    expect(result.events.map((event) => event.id)).toEqual(["timed-1"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("signale une réautorisation sans appeler CalendarList lorsque le scope manque", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ items: [timed] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await listGoogleCalendarEventsWithMeta("maxime", "2026-08-01T04:00:00.000Z", "2026-09-01T04:00:00.000Z");
    expect(result.centrisShowingsStatus).toBe("authorization_required");
    expect(result.events).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it.each([
    ["contact", "contact-42", "/contacts/contact-42"],
    ["listing", "listing-42", "/listings/listing-42"],
    ["transaction", "transaction-42", "/transactions/transaction-42"],
  ] as const)("conserve le lien CRM %s dans les propriétés Google et au retour", (crmEntityKind, crmEntityId, expectedLink) => {
    const payload = buildGoogleCalendarEventPayload({ ...input, crmEntityKind, crmEntityId });
    expect(payload.extendedProperties.private).toMatchObject({
      source: "forbes-crm",
      eventKind: "crm",
      crmBroker: "maxime",
      crmEntityKind,
      crmEntityId,
    });
    const mapped = mapGoogleCalendarEvent({
      ...timed,
      extendedProperties: { private: payload.extendedProperties.private },
    }, "maxime");
    expect(mapped).toMatchObject({ crmEntityKind, crmEntityId, crmLink: expectedLink });
  });

  it("retire proprement la relation CRM quand aucune entité n’est fournie", () => {
    const payload = buildGoogleCalendarEventPayload({ ...input, crmEntityKind: null, crmEntityId: null });
    expect(payload.extendedProperties.private).toEqual({ source: "forbes-crm", eventKind: "crm", crmBroker: "maxime" });
  });

  it("reconnaît les marqueurs sans transformer une URL externe en lien CRM", () => {
    expect(classifyGoogleCalendarEvent({ description: "Relance CRM — Équipe Forbes" })).toBe("follow_up");
    expect(mapGoogleCalendarEvent({ ...timed, description: "Voir https://example.com/contacts/contact-1/extra" }, "maxime").crmLink).toBeNull();
  });
});
