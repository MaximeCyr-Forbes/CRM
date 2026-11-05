import { describe, expect, it } from "vitest";
import { DEMO_DOSSIERS, type DemoDossier } from "@/app/lib/tools/plex/data/demo-dossiers";
import { conclusionColor, determineConclusion, evaluateIndicator } from "@/app/lib/tools/plex/domain/analysis";
import {
  calculateAnnualGrossRevenue,
  calculateBadDebtLoss,
  calculateCapitalizationRate,
  calculateDebtServiceCoverageRatio,
  calculateEffectiveGrossRevenue,
  calculateExpenseRatio,
  calculateGrossRentMultiplier,
  calculateInitialInvestment,
  calculateInitialInvestmentReturn,
  calculateNetIncomeMultiplier,
  calculateNetOperatingIncome,
  calculateOperatingExpenses,
  calculateVacancyLoss,
} from "@/app/lib/tools/plex/domain/calculations/financial";
import { calculateTenYearMortgageRenewalProjection } from "@/app/lib/tools/plex/domain/calculations/mortgage";
import { calculateTenYearFinancialProjection } from "@/app/lib/tools/plex/domain/calculations/projection";

const cents = (value: number) => value * 100;

function analyze(dossier: DemoDossier, purchasePrice = dossier.purchasePrice, scenario: keyof DemoDossier["monthlyRents"] = "current") {
  const gross = calculateAnnualGrossRevenue(dossier.monthlyRents[scenario].map(cents));
  const vacancy = calculateVacancyLoss(gross, dossier.vacancyRate);
  const badDebt = calculateBadDebtLoss(gross, dossier.badDebtRate);
  const effective = calculateEffectiveGrossRevenue(gross, vacancy, badDebt);
  const expenses = calculateOperatingExpenses(dossier.annualExpenses.map(cents));
  const noi = calculateNetOperatingIncome(effective, expenses);
  const mortgage = calculateTenYearMortgageRenewalProjection({
    purchasePriceInCents: cents(purchasePrice),
    downPayment: { type: "amount", valueInCents: cents(dossier.downPayment) },
    initialAnnualNominalRatePercent: dossier.initialRate,
    renewalAnnualNominalRatePercent: dossier.renewalRate,
    firstTermYears: dossier.firstTermYears,
    amortizationYears: dossier.amortizationYears,
    startDate: "2026-08-01",
  });
  const initialInvestment = calculateInitialInvestment(
    cents(dossier.downPayment),
    dossier.acquisitionCosts.map(cents),
    [cents(dossier.immediateWorks)],
    cents(dossier.initialReserve),
  );
  const projection = calculateTenYearFinancialProjection({
    baseAnnualGrossRevenueInCents: gross,
    baseAnnualOperatingExpensesInCents: expenses,
    yearOneAcquisitionCostsInCents: 0,
    annualRentIncreasePercent: dossier.annualRentIncrease,
    annualExpenseIncreasePercent: dossier.annualExpenseIncrease,
    vacancyRatePercent: dossier.vacancyRate,
    badDebtRatePercent: dossier.badDebtRate,
    analyzedPropertyValueInCents: cents(purchasePrice),
    annualAppreciationPercent: dossier.annualAppreciation,
    appreciationEnabled: true,
    mortgageSchedule: mortgage.schedule,
    majorWorks: dossier.majorWorks.map((work) => ({ year: work.year, amountInCents: cents(work.amount) })),
  });
  const annualMortgage = projection[0].mortgagePaymentsInCents;
  const metrics = {
    mrb: calculateGrossRentMultiplier(cents(purchasePrice), gross),
    mrn: calculateNetIncomeMultiplier(cents(purchasePrice), noi),
    capRate: calculateCapitalizationRate(noi, cents(purchasePrice)),
    monthlyCashFlow: projection[0].cashFlowAfterMajorWorksInCents / 12 / 100,
    initialReturn: calculateInitialInvestmentReturn(projection[0].cashFlowAfterMajorWorksInCents, initialInvestment),
    dscr: calculateDebtServiceCoverageRatio(noi, annualMortgage),
    expenseRatio: calculateExpenseRatio(expenses, effective),
  };
  const evaluations = [
    evaluateIndicator({ id: "mrb", label: "MRB", value: metrics.mrb, threshold: dossier.criteria.maximumMrb, direction: "maximum" }),
    evaluateIndicator({ id: "mrn", label: "MRN", value: metrics.mrn, threshold: dossier.criteria.maximumMrn, direction: "maximum" }),
    evaluateIndicator({ id: "cap", label: "Capitalisation", value: metrics.capRate, threshold: dossier.criteria.minimumCapitalizationRate, direction: "minimum" }),
    evaluateIndicator({ id: "cash", label: "Flux", value: metrics.monthlyCashFlow, threshold: dossier.criteria.minimumMonthlyCashFlow, direction: "minimum" }),
    evaluateIndicator({ id: "return", label: "Rendement", value: metrics.initialReturn, threshold: dossier.criteria.minimumInitialInvestmentReturn, direction: "minimum" }),
    evaluateIndicator({ id: "dscr", label: "DSCR", value: metrics.dscr, threshold: dossier.criteria.minimumDscr, direction: "minimum" }),
    evaluateIndicator({ id: "expenses", label: "Dépenses", value: metrics.expenseRatio, threshold: dossier.criteria.maximumExpenseRatio, direction: "maximum" }),
  ];
  return { gross, noi, mortgage, projection, metrics, result: conclusionColor(determineConclusion(evaluations)) };
}

describe("dossiers de démonstration du MVP", () => {
  for (const dossier of DEMO_DOSSIERS) {
    it(`${dossier.label} produit le résultat attendu`, () => {
      const analysis = analyze(dossier);
      expect(analysis.projection).toHaveLength(10);
      expect(analysis.result).toBe(dossier.expectedResult);
      expect(analysis.projection[0].netOperatingIncomeInCents).toBe(analysis.noi);
    });
  }

  it("les trois scénarios de revenus alimentent le même moteur", () => {
    const dossier = DEMO_DOSSIERS[1];
    const current = analyze(dossier, dossier.purchasePrice, "current");
    const potential = analyze(dossier, dossier.purchasePrice, "potential");
    const custom = analyze(dossier, dossier.purchasePrice, "custom");
    expect(potential.gross).toBeGreaterThan(custom.gross);
    expect(custom.gross).toBeGreaterThan(current.gross);
    expect(potential.projection[0].grossRevenueInCents).toBe(potential.gross);
  });

  it("un prix plus élevé influence tous les résultats dépendants demandés", () => {
    const dossier = DEMO_DOSSIERS[1];
    const base = analyze(dossier);
    const higher = analyze(dossier, 800_000);
    expect(higher.mortgage.financedAmountInCents).toBeGreaterThan(base.mortgage.financedAmountInCents);
    expect(higher.mortgage.initialMonthlyPaymentInCents).toBeGreaterThan(base.mortgage.initialMonthlyPaymentInCents);
    expect(higher.metrics.mrb).toBeGreaterThan(base.metrics.mrb);
    expect(higher.metrics.mrn).toBeGreaterThan(base.metrics.mrn);
    expect(higher.metrics.capRate).toBeLessThan(base.metrics.capRate);
    expect(higher.metrics.monthlyCashFlow).toBeLessThan(base.metrics.monthlyCashFlow);
    expect(higher.metrics.initialReturn).toBeLessThan(base.metrics.initialReturn);
    expect(higher.projection[0].mortgageBalanceInCents).toBeGreaterThan(base.projection[0].mortgageBalanceInCents);
    expect(higher.projection[9].estimatedPropertyValueInCents).toBeGreaterThan(base.projection[9].estimatedPropertyValueInCents);
    expect(higher.result).not.toBe(base.result);
  });
});
