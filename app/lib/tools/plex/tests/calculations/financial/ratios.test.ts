import { describe, expect, it } from "vitest";
import {
  calculateCapitalizationRate,
  calculateCostPerUnit,
  calculateDebtServiceCoverageRatio,
  calculateExpenseRatio,
  calculateGrossRentMultiplier,
  calculateNetIncomeMultiplier,
  calculateOperatingMargin,
} from "@/app/lib/tools/plex/domain/calculations/financial";

describe("ratios financiers", () => {
  it("calcule le MRB", () => {
    expect(calculateGrossRentMultiplier(100_000_000, 10_000_000)).toBe(10);
  });

  it("calcule le MRN", () => {
    expect(calculateNetIncomeMultiplier(100_000_000, 6_000_000)).toBeCloseTo(
      16.6667,
      4,
    );
  });

  it("calcule le taux de capitalisation", () => {
    expect(calculateCapitalizationRate(6_000_000, 100_000_000)).toBe(6);
  });

  it("calcule le ratio des dépenses", () => {
    expect(calculateExpenseRatio(4_000_000, 10_000_000)).toBe(40);
  });

  it("calcule la marge d’exploitation", () => {
    expect(calculateOperatingMargin(6_000_000, 10_000_000)).toBe(60);
  });

  it("calcule le coût par logement", () => {
    expect(calculateCostPerUnit(100_000_000, 4)).toBe(25_000_000);
  });

  it("calcule le DSCR", () => {
    expect(calculateDebtServiceCoverageRatio(6_000_000, 4_000_000)).toBe(1.5);
  });

  it("rend visibles les taux et le DSCR négatifs", () => {
    expect(calculateCapitalizationRate(-2_000_000, 100_000_000)).toBe(-2);
    expect(calculateOperatingMargin(-2_000_000, 10_000_000)).toBe(-20);
    expect(calculateDebtServiceCoverageRatio(-2_000_000, 4_000_000)).toBe(-0.5);
  });
});
