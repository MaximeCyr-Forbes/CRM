import { describe, expect, it } from "vitest";
import {
  calculateTenYearMortgageRenewalProjection,
  convertCanadianNominalRateToMonthly,
} from "@/app/lib/tools/plex/domain/calculations/mortgage";

const projection = calculateTenYearMortgageRenewalProjection({
  purchasePriceInCents: 50_000_000,
  downPayment: { type: "percentage", valuePercent: 20 },
  initialAnnualNominalRatePercent: 5,
  renewalAnnualNominalRatePercent: 6.5,
  firstTermYears: 5,
  amortizationYears: 25,
  startDate: "2026-01-15",
});

describe("projection hypothécaire avec renouvellement", () => {
  it("calcule le solde à la date du renouvellement", () => {
    expect(projection.renewalEffectiveDate).toBe("2031-01-15");
    expect(projection.balanceAtRenewalInCents).toBeCloseTo(
      35_403_002.8790767,
      5,
    );
    expect(projection.initialPeriod.closingBalanceInCents).toBe(
      projection.balanceAtRenewalInCents,
    );
  });

  it("calcule l’amortissement restant au renouvellement", () => {
    expect(projection.remainingAmortizationMonthsAtRenewal).toBe(240);
    expect(projection.remainingAmortizationYearsAtRenewal).toBe(20);
  });

  it("recalcule le paiement selon le taux de renouvellement", () => {
    expect(projection.initialMonthlyPaymentInCents).toBeCloseTo(
      232_641.994014806,
      6,
    );
    expect(projection.renewalMonthlyPaymentInCents).toBeCloseTo(
      262_159.384044207,
      6,
    );
    expect(projection.renewalMonthlyPaymentInCents).not.toBe(
      projection.initialMonthlyPaymentInCents,
    );
  });

  it("sépare le capital et les intérêts avant et après le renouvellement", () => {
    expect(
      projection.initialPeriod.principalRepaidInCents +
        projection.initialPeriod.interestPaidInCents,
    ).toBeCloseTo(projection.initialPeriod.paymentsInCents, 6);
    expect(
      projection.renewalPeriod.principalRepaidInCents +
        projection.renewalPeriod.interestPaidInCents,
    ).toBeCloseTo(projection.renewalPeriod.paymentsInCents, 6);
    expect(projection.initialPeriod.principalRepaidInCents).toBeGreaterThan(0);
    expect(projection.initialPeriod.interestPaidInCents).toBeGreaterThan(0);
    expect(projection.renewalPeriod.principalRepaidInCents).toBeGreaterThan(0);
    expect(projection.renewalPeriod.interestPaidInCents).toBeGreaterThan(0);
  });

  it("applique le nouveau taux dès le premier mois après le terme", () => {
    const lastInitialEntry = projection.schedule[59];
    const firstRenewalEntry = projection.schedule[60];
    const renewalMonthlyRate = convertCanadianNominalRateToMonthly(6.5);
    const initialMonthlyRate = convertCanadianNominalRateToMonthly(5);

    expect(lastInitialEntry.period).toBe("initial");
    expect(firstRenewalEntry.period).toBe("renewal");
    expect(firstRenewalEntry.annualNominalRatePercent).toBe(6.5);
    expect(firstRenewalEntry.interestInCents).toBeCloseTo(
      projection.balanceAtRenewalInCents * renewalMonthlyRate,
      7,
    );
    expect(firstRenewalEntry.interestInCents).not.toBeCloseTo(
      projection.balanceAtRenewalInCents * initialMonthlyRate,
      2,
    );
  });

  it("calcule le solde final après dix ans", () => {
    expect(projection.schedule).toHaveLength(120);
    expect(projection.finalBalanceAfterTenYearsInCents).toBeCloseTo(
      30_259_535.6257987,
      5,
    );
    expect(projection.schedule.at(-1)!.closingBalanceInCents).toBe(
      projection.finalBalanceAfterTenYearsInCents,
    );
  });

  it("produit aussi l’échéancier mensuel complet sur 300 mois", () => {
    expect(projection.fullAmortizationSchedule).toHaveLength(300);
    expect(projection.fullAmortizationSchedule[59].period).toBe("initial");
    expect(projection.fullAmortizationSchedule[60].period).toBe("renewal");
    expect(
      projection.fullAmortizationSchedule.reduce(
        (total, entry) => total + entry.principalInCents,
        0,
      ),
    ).toBeCloseTo(projection.financedAmountInCents, 5);
    expect(
      projection.fullAmortizationSchedule.at(-1)!.closingBalanceInCents,
    ).toBe(0);
  });

  it("accepte un premier terme et un amortissement différents", () => {
    const customProjection = calculateTenYearMortgageRenewalProjection({
      purchasePriceInCents: 75_000_000,
      downPayment: { type: "amount", valueInCents: 15_000_000 },
      initialAnnualNominalRatePercent: 4.2,
      renewalAnnualNominalRatePercent: 5.8,
      firstTermYears: 3,
      amortizationYears: 30,
      startDate: "2026-07-01",
    });

    expect(customProjection.initialPeriod.endMonth).toBe(36);
    expect(customProjection.renewalPeriod.startMonth).toBe(37);
    expect(customProjection.remainingAmortizationMonthsAtRenewal).toBe(324);
    expect(customProjection.schedule).toHaveLength(120);
  });
});
