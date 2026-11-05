import { describe, expect, it } from "vitest";
import { calculateCanadianFixedMortgage } from "@/app/lib/tools/plex/domain/calculations/mortgage";

const mortgage = calculateCanadianFixedMortgage({
  purchasePriceInCents: 50_000_000,
  downPayment: { type: "percentage", valuePercent: 20 },
  annualNominalInterestRatePercent: 5,
  amortizationYears: 25,
  termYears: 5,
  startDate: "2026-01-15",
});

describe("soldes, capital et intérêts", () => {
  it("calcule le solde après 12 mois", () => {
    expect(mortgage.amortizationSchedule[11].closingBalanceInCents).toBeCloseTo(
      39_169_097.3883815,
      5,
    );
  });

  it("calcule le solde après 60 mois", () => {
    expect(mortgage.amortizationSchedule[59].closingBalanceInCents).toBeCloseTo(
      35_403_002.8790767,
      5,
    );
    expect(mortgage.remainingBalanceInCents).toBeCloseTo(
      mortgage.amortizationSchedule[59].closingBalanceInCents,
      8,
    );
  });

  it("ajuste légèrement le dernier paiement sans produire de solde négatif", () => {
    const last = mortgage.amortizationSchedule.at(-1)!;

    expect(last.paymentInCents).not.toBe(mortgage.regularMonthlyPaymentInCents);
    expect(Math.abs(last.paymentInCents - mortgage.regularMonthlyPaymentInCents)).toBeLessThan(
      0.01,
    );
    expect(last.closingBalanceInCents).toBe(0);
    expect(last.principalInCents).toBe(last.openingBalanceInCents);
  });

  it("sépare et totalise tout le capital et tous les intérêts", () => {
    const totalPayments = mortgage.amortizationSchedule.reduce(
      (total, entry) => total + entry.paymentInCents,
      0,
    );

    expect(mortgage.totalPrincipalPaidInCents).toBeCloseTo(40_000_000, 5);
    expect(mortgage.totalInterestPaidInCents).toBeCloseTo(29_792_598.2044418, 4);
    expect(totalPayments).toBeCloseTo(
      mortgage.totalPrincipalPaidInCents + mortgage.totalInterestPaidInCents,
      6,
    );
  });

  it("fait correspondre les totaux du terme aux 60 premières mensualités", () => {
    const termEntries = mortgage.amortizationSchedule.slice(0, 60);
    const principal = termEntries.reduce(
      (total, entry) => total + entry.principalInCents,
      0,
    );
    const interest = termEntries.reduce(
      (total, entry) => total + entry.interestInCents,
      0,
    );

    expect(mortgage.principalRepaidInCents).toBe(principal);
    expect(mortgage.interestPaidInCents).toBe(interest);
    expect(mortgage.termSummary.months).toBe(60);
  });
});
