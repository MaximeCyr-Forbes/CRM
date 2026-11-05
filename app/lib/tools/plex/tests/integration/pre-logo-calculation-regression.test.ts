import { describe, expect, it } from "vitest";
import {
  calculateAnnualGrossRevenue,
  calculateBadDebtLoss,
  calculateEffectiveGrossRevenue,
  calculateNetOperatingIncome,
  calculateVacancyLoss,
} from "../../domain/calculations/financial";
import { calculateTenYearMortgageRenewalProjection } from "../../domain/calculations/mortgage";
import { calculateTenYearFinancialProjection } from "../../domain/calculations/projection";

describe("calcul de référence utilisé avant l’ajout du logo", () => {
  it("reproduit les résultats de la fiche à 899 000 $ avec le financement initial", () => {
    const grossRevenue = calculateAnnualGrossRevenue([5_172_000 / 12]);
    const vacancyLoss = calculateVacancyLoss(grossRevenue, 2);
    const badDebtLoss = calculateBadDebtLoss(grossRevenue, 1);
    const effectiveRevenue = calculateEffectiveGrossRevenue(
      grossRevenue,
      vacancyLoss,
      badDebtLoss,
    );
    const netOperatingIncome = calculateNetOperatingIncome(
      effectiveRevenue,
      789_200,
    );
    const mortgage = calculateTenYearMortgageRenewalProjection({
      purchasePriceInCents: 89_900_000,
      downPayment: { type: "amount", valueInCents: 0 },
      initialAnnualNominalRatePercent: 5,
      renewalAnnualNominalRatePercent: 6,
      firstTermYears: 5,
      amortizationYears: 25,
      startDate: "2026-07-13",
    });
    const projection = calculateTenYearFinancialProjection({
      baseAnnualGrossRevenueInCents: grossRevenue,
      baseAnnualOperatingExpensesInCents: 789_200,
      yearOneAcquisitionCostsInCents: 0,
      annualRentIncreasePercent: 3,
      annualExpenseIncreasePercent: 2,
      vacancyRatePercent: 2,
      badDebtRatePercent: 1,
      analyzedPropertyValueInCents: 89_900_000,
      annualAppreciationPercent: 3,
      appreciationEnabled: true,
      mortgageSchedule: mortgage.schedule,
      majorWorks: [],
    });

    expect(grossRevenue).toBe(5_172_000);
    expect(effectiveRevenue).toBe(5_016_840);
    expect(netOperatingIncome).toBe(4_227_640);
    expect(mortgage.financedAmountInCents).toBe(89_900_000);
    expect(mortgage.initialMonthlyPaymentInCents / 100).toBeCloseTo(5_228.63, 2);
    expect(projection).toHaveLength(10);
    expect(projection[0].netOperatingIncomeInCents).toBe(4_227_640);
    expect(projection[0].mortgagePaymentsInCents).toBeGreaterThan(0);
  });
});
