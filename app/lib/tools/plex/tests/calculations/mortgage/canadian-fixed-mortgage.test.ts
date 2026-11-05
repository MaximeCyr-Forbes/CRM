import { describe, expect, it } from "vitest";
import {
  calculateCanadianFixedMortgage,
  convertCanadianNominalRateToMonthly,
  resolveDownPaymentInCents,
} from "@/app/lib/tools/plex/domain/calculations/mortgage";

const baseInput = {
  purchasePriceInCents: 50_000_000,
  downPayment: { type: "percentage", valuePercent: 20 } as const,
  annualNominalInterestRatePercent: 5,
  amortizationYears: 25,
  termYears: 5,
  startDate: "2026-01-15",
};

describe("hypothèque canadienne à taux fixe", () => {
  it("convertit le taux nominal composé semestriellement en taux mensuel", () => {
    expect(convertCanadianNominalRateToMonthly(5)).toBeCloseTo(
      0.00412391546514423,
      15,
    );
  });

  it("calcule une hypothèque amortie sur 25 ans", () => {
    const result = calculateCanadianFixedMortgage(baseInput);

    expect(result.regularMonthlyPaymentInCents).toBeCloseTo(232_641.994014806, 6);
    expect(result.amortizationSchedule).toHaveLength(300);
  });

  it("calcule une hypothèque amortie sur 30 ans", () => {
    const result = calculateCanadianFixedMortgage({
      ...baseInput,
      amortizationYears: 30,
    });

    expect(result.regularMonthlyPaymentInCents).toBeCloseTo(213_476.271523502, 6);
    expect(result.amortizationSchedule).toHaveLength(360);
  });

  it("accepte une mise de fonds de 20 %", () => {
    const result = calculateCanadianFixedMortgage(baseInput);

    expect(result.downPaymentInCents).toBe(10_000_000);
    expect(result.downPaymentPercent).toBe(20);
    expect(result.financedAmountInCents).toBe(40_000_000);
  });

  it("accepte une mise de fonds en dollars", () => {
    const amount = resolveDownPaymentInCents(60_000_000, {
      type: "amount",
      valueInCents: 12_000_000,
    });

    expect(amount).toBe(12_000_000);
  });

  it("traite correctement un taux de 0 %", () => {
    const result = calculateCanadianFixedMortgage({
      purchasePriceInCents: 12_000_000,
      downPayment: { type: "amount", valueInCents: 0 },
      annualNominalInterestRatePercent: 0,
      amortizationYears: 25,
      termYears: 5,
      startDate: "2026-01-01",
    });

    expect(result.regularMonthlyPaymentInCents).toBe(40_000);
    expect(result.totalInterestPaidInCents).toBe(0);
    expect(result.totalPrincipalPaidInCents).toBeCloseTo(12_000_000, 6);
  });

  it("calcule sans troncature une propriété de 100 000 000 $", () => {
    const purchasePriceInCents = 10_000_000_000;
    const result = calculateCanadianFixedMortgage({
      purchasePriceInCents,
      downPayment: { type: "amount", valueInCents: 0 },
      annualNominalInterestRatePercent: 5,
      amortizationYears: 25,
      termYears: 5,
      startDate: "2026-01-01",
    });

    expect(result.purchasePriceInCents).toBe(purchasePriceInCents);
    expect(result.financedAmountInCents).toBe(purchasePriceInCents);
    expect(result.regularMonthlyPaymentInCents).toBeGreaterThan(0);
    expect(Number.isFinite(result.regularMonthlyPaymentInCents)).toBe(true);
    expect(result.amortizationSchedule).toHaveLength(300);
    expect(result.totalPrincipalPaidInCents).toBeCloseTo(purchasePriceInCents, 2);
  });
});
