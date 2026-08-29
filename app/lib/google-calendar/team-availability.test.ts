import { describe, expect, it } from "vitest";
import type { CRMCalendarEvent } from "../../data/calendar-event-types";
import type { CalendarBroker } from "../../data/calendar-types";
import { calculateCommonAvailability } from "./team-availability";

function event(broker: CalendarBroker, start: string, end: string, options: Partial<CRMCalendarEvent> = {}): CRMCalendarEvent {
  return {
    id: `${broker}-${start}`, broker, title: "Occupé", description: "", location: "",
    start, end, allDay: false, htmlLink: null, eventKind: "google",
    sourceCalendarId: "primary", sourceCalendarName: null,
    crmEntityKind: null, crmEntityId: null, crmLink: null, blocksAvailability: true,
    readOnly: false, recurring: false, ...options,
  };
}

describe("disponibilités communes", () => {
  it("exclut les périodes occupées de tous les courtiers cochés", () => {
    const slots = calculateCommonAvailability([
      event("france", "2026-08-21T13:00:00.000Z", "2026-08-21T14:00:00.000Z"),
      event("maxime", "2026-08-21T14:00:00.000Z", "2026-08-21T15:00:00.000Z"),
    ], "2026-08-21", ["france", "maxime", "sandrine"]);
    expect(slots.some((slot) => slot.startTime < "11:00" && slot.endTime > "09:00")).toBe(false);
    expect(slots).toContainEqual(expect.objectContaining({ startTime: "11:00", endTime: "18:00" }));
  });

  it("ignore anniversaire, relance et événement transparent", () => {
    const slots = calculateCommonAvailability([
      event("france", "2026-08-21", "2026-08-22", { allDay: true, eventKind: "birthday", blocksAvailability: false }),
      event("maxime", "2026-08-21", "2026-08-22", { allDay: true, eventKind: "follow_up", blocksAvailability: false }),
      event("sandrine", "2026-08-21T13:00:00.000Z", "2026-08-21T14:00:00.000Z", { blocksAvailability: false }),
    ], "2026-08-21", ["france", "maxime", "sandrine"]);
    expect(slots).toContainEqual(expect.objectContaining({ startTime: "08:00", endTime: "18:00" }));
  });

  it("bloque toute la journée de travail pour un événement manuel opaque all-day", () => {
    expect(calculateCommonAvailability([
      event("maxime", "2026-08-21", "2026-08-22", { allDay: true }),
    ], "2026-08-21", ["maxime"])).toEqual([]);
  });

  it("traite une visite Centris opaque comme occupée et respecte la transparence Google", () => {
    const opaque = event("maxime", "2026-08-21T14:00:00.000Z", "2026-08-21T18:25:00.000Z", {
      eventKind: "centris_showing", sourceCalendarId: "centris", sourceCalendarName: "Centris Zone Showings", readOnly: true,
    });
    const slots = calculateCommonAvailability([opaque], "2026-08-21", ["maxime"]);
    expect(slots.some((slot) => slot.startTime < "14:25" && slot.endTime > "10:00")).toBe(false);
    expect(calculateCommonAvailability([{ ...opaque, blocksAvailability: false }], "2026-08-21", ["maxime"]))
      .toContainEqual(expect.objectContaining({ startTime: "08:00", endTime: "18:00" }));
  });
});
