import { describe, expect, it } from "vitest";
import type { CRMCalendarEvent } from "../../data/calendar-event-types";
import type { CalendarBroker } from "../../data/calendar-types";
import { selectVisibleCalendarEvents } from "./calendar-team-events";

function event(broker: CalendarBroker, id: string): CRMCalendarEvent {
  return {
    id, broker, title: id, description: "", location: "", start: "2026-08-21T13:00:00.000Z",
    end: "2026-08-21T14:00:00.000Z", allDay: false, htmlLink: null, eventKind: "google",
    sourceCalendarId: "primary", sourceCalendarName: null,
    crmEntityKind: null, crmEntityId: null, crmLink: null, blocksAvailability: true,
    readOnly: false, recurring: false,
  };
}

describe("visibilité du calendrier d’équipe", () => {
  const events = [event("france", "abc"), event("maxime", "abc"), event("sandrine", "xyz")];

  it("Mon calendrier montre uniquement le courtier sélectionné", () => {
    expect(selectVisibleCalendarEvents(events, "personal", "maxime", [])).toEqual([events[1]]);
  });

  it("Équipe superpose les agendas cochés sans supprimer les événements masqués", () => {
    const visible = selectVisibleCalendarEvents(events, "team", "maxime", ["maxime", "sandrine"]);
    expect(visible).toEqual([events[1], events[2]]);
    expect(events).toHaveLength(3);
  });

  it("superpose les visites Centris des courtiers qui possèdent ce calendrier", () => {
    const centris = [
      ...["m1", "m2", "m3"].map((id) => ({ ...event("maxime", id), eventKind: "centris_showing" as const, sourceCalendarId: "maxime-centris", sourceCalendarName: "Centris Zone Showings", readOnly: true })),
      { ...event("sandrine", "s1"), eventKind: "centris_showing" as const, sourceCalendarId: "sandrine-centris", sourceCalendarName: "Centris Zone Showings", readOnly: true },
    ];
    expect(selectVisibleCalendarEvents(centris, "team", "france", ["france", "maxime", "sandrine"])).toHaveLength(4);
    expect(centris.filter((item) => item.broker === "france")).toHaveLength(0);
  });
});
