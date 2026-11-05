import { describe, expect, it } from "vitest";
import {
  getCurrentMonthlyRevenues,
  getMonthlyRentForScenario,
  getPotentialMonthlyRentsWithCurrentFallback,
  type ScenarioMonthlyRents,
} from "@/app/lib/tools/plex/domain/scenarios/revenue-scenarios";

describe("scénarios de revenus", () => {
  const rents: ScenarioMonthlyRents = {
    currentMonthlyRent: 1_500,
    potentialMonthlyRent: 1_750,
    customMonthlyRent: 1_625,
  };

  it("sélectionne le loyer actuel", () => {
    expect(getMonthlyRentForScenario(rents, "current")).toBe(1_500);
  });

  it("sélectionne le loyer potentiel", () => {
    expect(getMonthlyRentForScenario(rents, "potential")).toBe(1_750);
  });

  it.each([0, -25, Number.NaN])(
    "conserve le loyer actuel lorsque le loyer potentiel n’est pas positif (%s)",
    (potentialMonthlyRent) => {
      expect(
        getMonthlyRentForScenario(
          { ...rents, potentialMonthlyRent },
          "potential",
        ),
      ).toBe(1_500);
    },
  );

  it("sélectionne le loyer personnalisé", () => {
    expect(getMonthlyRentForScenario(rents, "custom")).toBe(1_625);
  });

  it("ne remplace jamais le loyer actuel lors d’un changement de scénario", () => {
    getMonthlyRentForScenario(rents, "potential");
    expect(rents.currentMonthlyRent).toBe(1_500);
  });

  it("remplace chaque loyer actuel seulement lorsqu’un loyer potentiel est saisi", () => {
    const rows = [
      rents,
      {
        currentMonthlyRent: 9_000,
        potentialMonthlyRent: 0,
        customMonthlyRent: 8_000,
      },
    ];

    expect(getPotentialMonthlyRentsWithCurrentFallback(rows)).toEqual([
      1_750,
      9_000,
    ]);
  });

  it("combine les logements actuels et potentiels sans additionner les deux loyers", () => {
    const rows = [
      {
        currentMonthlyRent: 1_128,
        potentialMonthlyRent: 1_500,
        customMonthlyRent: 99_000,
      },
      {
        currentMonthlyRent: 1_750,
        potentialMonthlyRent: 0,
        customMonthlyRent: 99_000,
      },
      {
        currentMonthlyRent: 798,
        potentialMonthlyRent: 1_200,
        customMonthlyRent: 99_000,
      },
    ];

    const selectedMonthlyRents =
      getPotentialMonthlyRentsWithCurrentFallback(rows);

    expect(selectedMonthlyRents).toEqual([1_500, 1_750, 1_200]);
    expect(selectedMonthlyRents.reduce((total, rent) => total + rent, 0) * 12)
      .toBe(53_400);
  });

  it("calcule les revenus actuels sans reprendre les loyers potentiels", () => {
    const rows = [
      { ...rents, otherMonthlyIncome: 100 },
      {
        currentMonthlyRent: 900,
        potentialMonthlyRent: 5_000,
        customMonthlyRent: 4_000,
        otherMonthlyIncome: 50,
      },
    ];

    expect(getCurrentMonthlyRevenues(rows)).toEqual([1_600, 950]);
  });
});
