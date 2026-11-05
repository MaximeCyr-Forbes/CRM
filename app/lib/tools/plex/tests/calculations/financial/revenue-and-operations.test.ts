import { describe, expect, it } from "vitest";
import {
  calculateAnnualGrossRevenue,
  calculateBadDebtLoss,
  calculateEffectiveGrossRevenue,
  calculateManagementExpense,
  calculateNetOperatingIncome,
  calculateOperatingExpenses,
  calculateVacancyLoss,
} from "@/app/lib/tools/plex/domain/calculations/financial";

describe("revenus et exploitation", () => {
  it("calcule les revenus bruts annuels à partir des revenus mensuels", () => {
    expect(calculateAnnualGrossRevenue([100_000, 125_000])).toBe(2_700_000);
  });

  it("calcule les pertes de revenus liées à la vacance", () => {
    expect(calculateVacancyLoss(12_000_000, 5)).toBe(600_000);
  });

  it("calcule les mauvaises créances", () => {
    expect(calculateBadDebtLoss(12_000_000, 1)).toBe(120_000);
  });

  it("calcule les revenus bruts effectifs", () => {
    expect(calculateEffectiveGrossRevenue(12_000_000, 600_000, 120_000)).toBe(
      11_280_000,
    );
  });

  it("additionne les dépenses d’exploitation courantes", () => {
    expect(calculateOperatingExpenses([1_000_000, 2_000_000, 500_000])).toBe(
      3_500_000,
    );
  });

  it("calcule la gestion en pourcentage des revenus bruts", () => {
    expect(calculateManagementExpense(12_000_000, 5)).toBe(600_000);
    expect(calculateManagementExpense(12_000_000, 4.5)).toBe(540_000);
    expect(calculateManagementExpense(12_000_000, 0)).toBe(0);
  });

  it("protège le taux de gestion contre les valeurs invalides", () => {
    expect(() => calculateManagementExpense(12_000_000, -1)).toThrow();
    expect(() => calculateManagementExpense(12_000_000, 101)).toThrow();
    expect(() => calculateManagementExpense(12_000_000, Number.NaN)).toThrow();
  });

  it("calcule le revenu net d’exploitation", () => {
    expect(calculateNetOperatingIncome(11_280_000, 3_500_000)).toBe(7_780_000);
  });

  it("conserve un revenu net négatif quand les dépenses dépassent les revenus", () => {
    expect(calculateNetOperatingIncome(1_000_000, 1_500_000)).toBe(-500_000);
  });
});
