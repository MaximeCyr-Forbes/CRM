import { describe, expect, it } from "vitest";
import { calendarEventKey } from "./calendar-event-types";

describe("identité des événements d’équipe", () => {
  it("conserve deux événements Google portant le même id dans deux agendas", () => {
    const france = calendarEventKey({ broker: "france", id: "abc" });
    const maxime = calendarEventKey({ broker: "maxime", id: "abc" });
    expect(new Set([france, maxime]).size).toBe(2);
    expect([france, maxime]).toEqual(["france:abc", "maxime:abc"]);
  });
});
