import { describe, expect, it } from "vitest";
import { calculateTenYearMortgageRenewalProjection } from "@/app/lib/tools/plex/domain/calculations/mortgage";
import {
  calculateTenYearFinancialProjection,
  type TenYearFinancialProjectionInput,
} from "@/app/lib/tools/plex/domain/calculations/projection";

const mortgage = calculateTenYearMortgageRenewalProjection({
  purchasePriceInCents: 50_000_000,
  downPayment: { type: "percentage", valuePercent: 20 },
  initialAnnualNominalRatePercent: 5,
  renewalAnnualNominalRatePercent: 6.5,
  firstTermYears: 5,
  amortizationYears: 25,
  startDate: "2026-01-15",
});

const baseInput: TenYearFinancialProjectionInput = {
  baseAnnualGrossRevenueInCents: 12_000_000,
  baseAnnualOperatingExpensesInCents: 4_000_000,
  yearOneAcquisitionCostsInCents: 0,
  annualRentIncreasePercent: 3,
  annualExpenseIncreasePercent: 2,
  vacancyRatePercent: 5,
  badDebtRatePercent: 1,
  analyzedPropertyValueInCents: 50_000_000,
  annualAppreciationPercent: 3,
  appreciationEnabled: true,
  mortgageSchedule: mortgage.schedule,
  majorWorks: [{ year: 3, amountInCents: 2_000_000 }],
};

describe("projection financière sur dix ans", () => {
  it("applique l’augmentation annuelle des loyers à partir de l’année 2", () => {
    const projection = calculateTenYearFinancialProjection(baseInput);

    expect(projection[0].grossRevenueInCents).toBe(12_000_000);
    expect(projection[1].grossRevenueInCents).toBeCloseTo(12_360_000, 6);
    expect(projection[9].grossRevenueInCents).toBeCloseTo(
      12_000_000 * 1.03 ** 9,
      6,
    );
  });

  it("applique l’augmentation annuelle des dépenses", () => {
    const projection = calculateTenYearFinancialProjection(baseInput);

    expect(projection[0].operatingExpensesInCents).toBe(4_000_000);
    expect(projection[1].operatingExpensesInCents).toBeCloseTo(4_080_000, 6);
  });

  it("recalcule la gestion sur les revenus bruts de chaque année sans la doubler", () => {
    const projection = calculateTenYearFinancialProjection({
      ...baseInput,
      managementRatePercent: 5,
    });

    expect(projection[0].operatingExpensesInCents).toBe(4_600_000);
    expect(projection[1].operatingExpensesInCents).toBeCloseTo(
      4_000_000 * 1.02 + 12_000_000 * 1.03 * 0.05,
      6,
    );
  });

  it("place les travaux majeurs uniquement dans la bonne année", () => {
    const projection = calculateTenYearFinancialProjection(baseInput);

    expect(projection[1].majorWorksInCents).toBe(0);
    expect(projection[2].majorWorksInCents).toBe(2_000_000);
    expect(projection[3].majorWorksInCents).toBe(0);
    expect(
      projection[2].cashFlowBeforeMajorWorksInCents -
        projection[2].cashFlowAfterMajorWorksInCents,
    ).toBe(2_000_000);
  });

  it("applique les frais d’acquisition fixes uniquement à l’année 1", () => {
    const acquisitionCostsInCents = 1_500_000;
    const projection = calculateTenYearFinancialProjection({
      ...baseInput,
      yearOneAcquisitionCostsInCents: acquisitionCostsInCents,
    });

    expect(projection[0].acquisitionCostsInCents).toBe(
      acquisitionCostsInCents,
    );
    expect(projection[1].acquisitionCostsInCents).toBe(0);
    expect(
      projection.slice(1).every((year) => year.acquisitionCostsInCents === 0),
    ).toBe(true);
  });

  it("exclut les frais d’acquisition des dépenses courantes et du RNO", () => {
    const withoutAcquisitionCosts =
      calculateTenYearFinancialProjection(baseInput);
    const withAcquisitionCosts = calculateTenYearFinancialProjection({
      ...baseInput,
      yearOneAcquisitionCostsInCents: 1_500_000,
    });

    expect(withAcquisitionCosts[0].operatingExpensesInCents).toBe(
      withoutAcquisitionCosts[0].operatingExpensesInCents,
    );
    expect(withAcquisitionCosts[0].netOperatingIncomeInCents).toBe(
      withoutAcquisitionCosts[0].netOperatingIncomeInCents,
    );
  });

  it("soustrait les frais d’acquisition du flux après travaux et du cumul", () => {
    const acquisitionCostsInCents = 1_500_000;
    const withoutAcquisitionCosts =
      calculateTenYearFinancialProjection(baseInput);
    const withAcquisitionCosts = calculateTenYearFinancialProjection({
      ...baseInput,
      yearOneAcquisitionCostsInCents: acquisitionCostsInCents,
    });

    expect(withAcquisitionCosts[0].cashFlowAfterMajorWorksInCents).toBeCloseTo(
      withoutAcquisitionCosts[0].cashFlowAfterMajorWorksInCents -
        acquisitionCostsInCents,
      6,
    );
    expect(withAcquisitionCosts[0].cumulativeCashFlowInCents).toBeCloseTo(
      withoutAcquisitionCosts[0].cumulativeCashFlowInCents -
        acquisitionCostsInCents,
      6,
    );
    expect(withAcquisitionCosts[1].cashFlowAfterMajorWorksInCents).toBeCloseTo(
      withoutAcquisitionCosts[1].cashFlowAfterMajorWorksInCents,
      6,
    );
    expect(withAcquisitionCosts[1].cumulativeCashFlowInCents).toBeCloseTo(
      withoutAcquisitionCosts[1].cumulativeCashFlowInCents -
        acquisitionCostsInCents,
      6,
    );
  });

  it("refuse des frais d’acquisition négatifs ou non numériques", () => {
    for (const invalidCosts of [-1, Number.NaN]) {
      expect(() =>
        calculateTenYearFinancialProjection({
          ...baseInput,
          yearOneAcquisitionCostsInCents: invalidCosts,
        }),
      ).toThrow(/frais d’acquisition de l’année 1/i);
    }
  });

  it("applique le renouvellement après la cinquième année", () => {
    const projection = calculateTenYearFinancialProjection(baseInput);

    expect(projection[4].mortgagePaymentsInCents).toBeCloseTo(
      mortgage.initialMonthlyPaymentInCents * 12,
      5,
    );
    expect(projection[5].mortgagePaymentsInCents).toBeCloseTo(
      mortgage.renewalMonthlyPaymentInCents * 12,
      5,
    );
    expect(projection[5].mortgagePaymentsInCents).not.toBeCloseTo(
      projection[4].mortgagePaymentsInCents,
      2,
    );
  });

  it("reprend le solde hypothécaire de chaque fin d’année", () => {
    const projection = calculateTenYearFinancialProjection(baseInput);

    expect(projection).toHaveLength(10);
    expect(projection[9].mortgageBalanceInCents).toBe(
      mortgage.schedule[119].closingBalanceInCents,
    );
  });

  it("cumule exactement les flux de trésorerie après travaux", () => {
    const projection = calculateTenYearFinancialProjection(baseInput);
    const totalCashFlow = projection.reduce(
      (total, year) => total + year.cashFlowAfterMajorWorksInCents,
      0,
    );

    expect(projection[9].cumulativeCashFlowInCents).toBeCloseTo(totalCashFlow, 6);
  });

  it("conserve la valeur analysée avec une appréciation de 0 %", () => {
    const projection = calculateTenYearFinancialProjection({
      ...baseInput,
      annualAppreciationPercent: 0,
    });

    projection.forEach((year) => {
      expect(year.estimatedPropertyValueInCents).toBe(50_000_000);
      expect(year.estimatedEquityInCents).toBeCloseTo(
        50_000_000 - year.mortgageBalanceInCents,
        6,
      );
    });
  });

  it("fait passer une valeur de 500 000 $ à 525 000 $ avec une prise de valeur de 5 %", () => {
    const projection = calculateTenYearFinancialProjection({
      ...baseInput,
      annualAppreciationPercent: 5,
    });

    expect(projection[0].estimatedPropertyValueInCents).toBeCloseTo(52_500_000, 6);
  });

  it("ignore entièrement le taux lorsque l’appréciation est désactivée", () => {
    const projection = calculateTenYearFinancialProjection({
      ...baseInput,
      annualAppreciationPercent: 8,
      appreciationEnabled: false,
    });

    expect(projection).toHaveLength(10);
    expect(projection.every((year) => year.estimatedPropertyValueInCents === 50_000_000)).toBe(
      true,
    );
  });

  it("projette sans troncature une propriété de 100 000 000 $", () => {
    const analyzedPropertyValueInCents = 10_000_000_000;
    const largeMortgage = calculateTenYearMortgageRenewalProjection({
      purchasePriceInCents: analyzedPropertyValueInCents,
      downPayment: { type: "amount", valueInCents: 0 },
      initialAnnualNominalRatePercent: 5,
      renewalAnnualNominalRatePercent: 6,
      firstTermYears: 5,
      amortizationYears: 25,
      startDate: "2026-01-15",
    });
    const projection = calculateTenYearFinancialProjection({
      ...baseInput,
      analyzedPropertyValueInCents,
      baseAnnualGrossRevenueInCents: 1_200_000_000,
      baseAnnualOperatingExpensesInCents: 400_000_000,
      annualAppreciationPercent: 0,
      mortgageSchedule: largeMortgage.schedule,
    });

    expect(projection).toHaveLength(10);
    expect(projection.every((year) => year.estimatedPropertyValueInCents === analyzedPropertyValueInCents)).toBe(true);
    expect(projection.every((year) => Number.isFinite(year.mortgageBalanceInCents))).toBe(true);
  });
});
