import { describe, expect, it } from "vitest";
import { calendarEventKey } from "./calendar-event-types";

describe("identité des événements d’équipe", () => {
  it("conserve deux événements Google portant le même id dans deux agendas", () => {
    const france = calendarEventKey({ broker: "france", id: "abc" });
    const maxime = calendarEventKey({ broker: "maxime", id: "abc" });
    expect(new Set([france, maxime]).size).toBe(2);
    expect([france, maxime]).toEqual(["france:abc", "maxime:abc"]);
  });

  it("conserve deux événements portant le même id dans deux calendriers du même courtier", () => {
    const principal = calendarEventKey({ broker: "maxime", id: "abc", sourceCalendarId: "primary" });
    const centris = calendarEventKey({ broker: "maxime", id: "abc", sourceCalendarId: "centris-calendar" });
    expect(new Set([principal, centris]).size).toBe(2);
    expect([principal, centris]).toEqual(["maxime:primary:abc", "maxime:centris-calendar:abc"]);
  });
});
