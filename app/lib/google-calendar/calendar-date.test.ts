import { describe, expect, it } from "vitest";
import { addCalendarDays, calendarDateTimeISO, calendarMonthGrid, calendarRange, startOfCalendarWeek } from "./calendar-date";

describe("dates du calendrier au Québec", () => {
  it("convertit 09:00 America/Toronto sans glissement de jour", () => {
    expect(calendarDateTimeISO("2026-08-21", "09:00")).toBe("2026-08-21T13:00:00.000Z");
    expect(calendarDateTimeISO("2026-01-21", "09:00")).toBe("2026-01-21T14:00:00.000Z");
  });

  it("produit une grille mensuelle complète du lundi au dimanche", () => {
    const dates = calendarMonthGrid("2026-08-21");
    expect(dates).toHaveLength(42);
    expect(startOfCalendarWeek(dates[0])).toBe(dates[0]);
    expect(addCalendarDays(dates[0], 41)).toBe(dates[41]);
  });

  it("calcule les plages mois, semaine et jour", () => {
    expect(calendarRange("day", "2026-08-21")).toEqual({ startDate: "2026-08-21", endDate: "2026-08-22" });
    expect(calendarRange("week", "2026-08-21")).toEqual({ startDate: "2026-08-17", endDate: "2026-08-24" });
    expect(calendarRange("month", "2026-08-21").startDate).toBe("2026-07-27");
  });
});
