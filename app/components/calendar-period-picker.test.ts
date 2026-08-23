import { describe, expect, it } from "vitest";
import { CALENDAR_MONTHS, calendarYearWindow } from "./calendar-period-picker";

describe("sélecteur de période du calendrier", () => {
  it("présente exactement les douze mois français", () => {
    expect(CALENDAR_MONTHS).toEqual([
      "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
      "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
    ]);
  });

  it("permet d’atteindre rapidement une année éloignée dans la plage autorisée", () => {
    expect(calendarYearWindow(2040)).toContain(2040);
    expect(calendarYearWindow(1900)).toEqual([1900, 1901, 1902, 1903, 1904, 1905, 1906, 1907, 1908]);
    expect(calendarYearWindow(2100)).toEqual([2092, 2093, 2094, 2095, 2096, 2097, 2098, 2099, 2100]);
  });
});
