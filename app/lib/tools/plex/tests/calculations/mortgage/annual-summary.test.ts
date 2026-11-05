import { describe, expect, it } from "vitest";
import { calculateCanadianFixedMortgage } from "@/app/lib/tools/plex/domain/calculations/mortgage";

const mortgage = calculateCanadianFixedMortgage({
  purchasePriceInCents: 42_500_000,
  downPayment: { type: "amount", valueInCents: 8_500_000 },
  annualNominalInterestRatePercent: 4.35,
  amortizationYears: 30,
  termYears: 3,
  startDate: "2026-01-31",
});

describe("résumé annuel", () => {
  it("regroupe les résultats mensuels sans perte de précision", () => {
    mortgage.annualSummary.forEach((year, index) => {
      const monthlyEntries = mortgage.amortizationSchedule.slice(index * 12, index * 12 + 12);

      expect(year.paymentsInCents).toBe(
        monthlyEntries.reduce((total, entry) => total + entry.paymentInCents, 0),
      );
      expect(year.principalInCents).toBe(
        monthlyEntries.reduce((total, entry) => total + entry.principalInCents, 0),
      );
      expect(year.interestInCents).toBe(
        monthlyEntries.reduce((total, entry) => total + entry.interestInCents, 0),
      );
      expect(year.closingBalanceInCents).toBe(
        monthlyEntries.at(-1)!.closingBalanceInCents,
      );
    });
  });

  it("produit un résumé pour chaque année d’amortissement", () => {
    expect(mortgage.annualSummary).toHaveLength(30);
    expect(mortgage.annualSummary[0].firstPaymentDate).toBe("2026-02-28");
    expect(mortgage.annualSummary.at(-1)!.closingBalanceInCents).toBe(0);
  });

  it("expose les paiements annuels réguliers", () => {
    expect(mortgage.regularAnnualPaymentsInCents).toBe(
      mortgage.regularMonthlyPaymentInCents * 12,
    );
  });
});
