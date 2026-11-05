import { describe, expect, it } from "vitest";
import {
  calculateAnnualGrossRevenue,
  calculateBadDebtLoss,
  calculateCapitalizationRate,
  calculateCashFlowAfterMajorWorks,
  calculateCashFlowBeforeMajorWorks,
  calculateCostPerUnit,
  calculateDebtServiceCoverageRatio,
  calculateDownPaymentReturn,
  calculateEffectiveGrossRevenue,
  calculateExpenseRatio,
  calculateGrossRentMultiplier,
  calculateInitialInvestment,
  calculateInitialInvestmentReturn,
  calculateNetIncomeMultiplier,
  calculateNetOperatingIncome,
  calculateOperatingExpenses,
  calculateOperatingMargin,
  calculateVacancyLoss,
} from "@/app/lib/tools/plex/domain/calculations/financial";

function expectErrorCode(calculation: () => unknown, code: string): void {
  expect(calculation).toThrowError(expect.objectContaining({ code }));
}

describe("protections du moteur financier", () => {
  it.each([
    ["MRB", () => calculateGrossRentMultiplier(100_000_000, 0)],
    ["MRN", () => calculateNetIncomeMultiplier(100_000_000, 0)],
    ["capitalisation", () => calculateCapitalizationRate(1_000_000, 0)],
    ["ratio des dépenses", () => calculateExpenseRatio(1_000_000, 0)],
    ["marge", () => calculateOperatingMargin(1_000_000, 0)],
    ["coût par logement", () => calculateCostPerUnit(100_000_000, 0)],
    ["rendement mise de fonds", () => calculateDownPaymentReturn(1_000_000, 0)],
    [
      "rendement investissement initial",
      () => calculateInitialInvestmentReturn(1_000_000, 0),
    ],
    ["DSCR", () => calculateDebtServiceCoverageRatio(1_000_000, 0)],
  ])("refuse une division par zéro pour %s", (_name, calculation) => {
    expectErrorCode(
      calculation,
      _name === "coût par logement" ? "ZERO_UNIT_COUNT" : "DIVISION_BY_ZERO",
    );
  });

  it.each([
    ["MRB", () => calculateGrossRentMultiplier(undefined as unknown as number, 1)],
    ["MRN", () => calculateNetIncomeMultiplier(undefined as unknown as number, 1)],
    [
      "capitalisation",
      () => calculateCapitalizationRate(1, undefined as unknown as number),
    ],
    ["coût par logement", () => calculateCostPerUnit(undefined as unknown as number, 1)],
  ])("exige un prix d’achat pour %s", (_name, calculation) => {
    expectErrorCode(calculation, "MISSING_PURCHASE_PRICE");
  });

  it.each([
    ["revenu", () => calculateAnnualGrossRevenue([Number.NaN])],
    ["taux", () => calculateVacancyLoss(1_000_000, Number.NaN)],
    ["dépense", () => calculateOperatingExpenses([Number.POSITIVE_INFINITY])],
    ["ratio", () => calculateCapitalizationRate(Number.NaN, 1_000_000)],
    ["flux", () => calculateCashFlowBeforeMajorWorks(Number.NaN, 1_000_000)],
    [
      "investissement",
      () => calculateInitialInvestment(1, [], [], Number.NaN),
    ],
  ])("refuse une valeur non numérique dans %s", (_name, calculation) => {
    expectErrorCode(calculation, "INVALID_NUMBER");
  });

  it.each([
    ["revenu", () => calculateAnnualGrossRevenue([-1])],
    ["dépense", () => calculateOperatingExpenses([-1])],
    ["prix", () => calculateGrossRentMultiplier(-1, 1)],
    ["hypothèque", () => calculateCashFlowBeforeMajorWorks(1, -1)],
    ["travaux", () => calculateCashFlowAfterMajorWorks(1, 0, -1)],
    ["mise de fonds", () => calculateDownPaymentReturn(1, -1)],
    ["logements", () => calculateCostPerUnit(1, -1)],
  ])("refuse un montant négatif invalide dans %s", (_name, calculation) => {
    expectErrorCode(calculation, "NEGATIVE_AMOUNT");
  });

  it("refuse un pourcentage hors de l’intervalle de 0 à 100", () => {
    expectErrorCode(() => calculateBadDebtLoss(1_000_000, 101), "INVALID_PERCENTAGE");
  });

  it("refuse des pertes supérieures aux revenus bruts", () => {
    expectErrorCode(
      () => calculateEffectiveGrossRevenue(1_000_000, 700_000, 400_000),
      "NEGATIVE_AMOUNT",
    );
  });

  it("protège le MRN contre un revenu net négatif", () => {
    expectErrorCode(
      () => calculateNetIncomeMultiplier(100_000_000, -1_000_000),
      "NEGATIVE_NET_OPERATING_INCOME",
    );
  });

  it("exclut hypothèque et travaux du revenu net d’exploitation", () => {
    const netOperatingIncome = calculateNetOperatingIncome(10_000_000, 4_000_000);

    expect(netOperatingIncome).toBe(6_000_000);
    expect(calculateCashFlowBeforeMajorWorks(netOperatingIncome, 3_000_000)).toBe(
      3_000_000,
    );
    expect(
      calculateCashFlowAfterMajorWorks(netOperatingIncome, 3_000_000, 1_000_000),
    ).toBe(2_000_000);
  });
});
