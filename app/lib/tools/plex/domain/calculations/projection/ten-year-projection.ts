import {
  calculateBadDebtLoss,
  calculateCashFlowAfterMajorWorks,
  calculateCashFlowBeforeMajorWorks,
  calculateEffectiveGrossRevenue,
  calculateManagementExpense,
  calculateNetOperatingIncome,
  calculateOperatingExpenses,
  calculateVacancyLoss,
} from "../financial";

export const FINANCIAL_PROJECTION_YEARS = 10;
const MONTHS_PER_YEAR = 12;

export interface ProjectionMortgageEntry {
  paymentInCents: number;
  principalInCents: number;
  interestInCents: number;
  closingBalanceInCents: number;
}

export interface ProjectionMajorWork {
  year: number;
  amountInCents: number;
}

export interface TenYearFinancialProjectionInput {
  baseAnnualGrossRevenueInCents: number;
  baseAnnualOperatingExpensesInCents: number;
  yearOneAcquisitionCostsInCents: number;
  managementRatePercent?: number;
  annualRentIncreasePercent: number;
  annualExpenseIncreasePercent: number;
  vacancyRatePercent: number;
  badDebtRatePercent: number;
  analyzedPropertyValueInCents: number;
  annualAppreciationPercent: number;
  appreciationEnabled: boolean;
  mortgageSchedule: readonly ProjectionMortgageEntry[];
  majorWorks: readonly ProjectionMajorWork[];
}

export interface AnnualFinancialProjection {
  year: number;
  grossRevenueInCents: number;
  vacancyLossInCents: number;
  badDebtLossInCents: number;
  effectiveGrossRevenueInCents: number;
  operatingExpensesInCents: number;
  netOperatingIncomeInCents: number;
  mortgagePaymentsInCents: number;
  principalRepaidInCents: number;
  interestPaidInCents: number;
  majorWorksInCents: number;
  acquisitionCostsInCents: number;
  cashFlowBeforeMajorWorksInCents: number;
  cashFlowAfterMajorWorksInCents: number;
  cumulativeCashFlowInCents: number;
  mortgageBalanceInCents: number;
  estimatedPropertyValueInCents: number;
  estimatedEquityInCents: number;
}

export class FinancialProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinancialProjectionError";
  }
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new FinancialProjectionError(`${label} doit être une valeur positive ou nulle.`);
  }
}

function assertPercentage(value: number, label: string): void {
  assertFiniteNonNegative(value, label);
  if (value > 100) {
    throw new FinancialProjectionError(`${label} doit être compris entre 0 et 100.`);
  }
}

/**
 * Produit exactement dix années. Les revenus et dépenses de l’année 1 utilisent
 * les montants de base; leurs augmentations commencent à l’année 2. La valeur
 * immobilière représente la valeur estimée à la fin de chaque année.
 */
export function calculateTenYearFinancialProjection(
  input: TenYearFinancialProjectionInput,
): readonly AnnualFinancialProjection[] {
  assertFiniteNonNegative(
    input.baseAnnualGrossRevenueInCents,
    "Les revenus bruts annuels",
  );
  assertFiniteNonNegative(
    input.baseAnnualOperatingExpensesInCents,
    "Les dépenses annuelles",
  );
  assertFiniteNonNegative(
    input.yearOneAcquisitionCostsInCents,
    "Les frais d’acquisition de l’année 1",
  );
  assertPercentage(input.managementRatePercent ?? 0, "Le taux de gestion");
  assertPercentage(input.annualRentIncreasePercent, "L’augmentation des loyers");
  assertPercentage(
    input.annualExpenseIncreasePercent,
    "L’augmentation des dépenses",
  );
  assertPercentage(input.vacancyRatePercent, "Le taux de vacance");
  assertPercentage(input.badDebtRatePercent, "Le taux de mauvaises créances");
  assertPercentage(input.annualAppreciationPercent, "L’appréciation annuelle");
  assertFiniteNonNegative(
    input.analyzedPropertyValueInCents,
    "La valeur analysée de la propriété",
  );

  if (input.vacancyRatePercent + input.badDebtRatePercent > 100) {
    throw new FinancialProjectionError(
      "La vacance et les mauvaises créances ne peuvent pas dépasser 100 % ensemble.",
    );
  }
  if (input.mortgageSchedule.length !== FINANCIAL_PROJECTION_YEARS * MONTHS_PER_YEAR) {
    throw new FinancialProjectionError(
      "L’échéancier hypothécaire doit contenir exactement 120 mensualités.",
    );
  }
  input.majorWorks.forEach((work) => {
    if (!Number.isInteger(work.year) || work.year < 1 || work.year > 10) {
      throw new FinancialProjectionError("L’année des travaux doit être comprise entre 1 et 10.");
    }
    assertFiniteNonNegative(work.amountInCents, "Le montant des travaux");
  });

  const rentGrowthFactor = 1 + input.annualRentIncreasePercent / 100;
  const expenseGrowthFactor = 1 + input.annualExpenseIncreasePercent / 100;
  const appreciationFactor = 1 + input.annualAppreciationPercent / 100;
  let cumulativeCashFlowInCents = 0;

  return Array.from({ length: FINANCIAL_PROJECTION_YEARS }, (_, index) => {
    const year = index + 1;
    const mortgageEntries = input.mortgageSchedule.slice(
      index * MONTHS_PER_YEAR,
      year * MONTHS_PER_YEAR,
    );
    const grossRevenueInCents =
      input.baseAnnualGrossRevenueInCents * Math.pow(rentGrowthFactor, index);
    const vacancyLossInCents = calculateVacancyLoss(
      grossRevenueInCents,
      input.vacancyRatePercent,
    );
    const badDebtLossInCents = calculateBadDebtLoss(
      grossRevenueInCents,
      input.badDebtRatePercent,
    );
    const effectiveGrossRevenueInCents = calculateEffectiveGrossRevenue(
      grossRevenueInCents,
      vacancyLossInCents,
      badDebtLossInCents,
    );
    const operatingExpensesInCents = calculateOperatingExpenses([
      input.baseAnnualOperatingExpensesInCents * Math.pow(expenseGrowthFactor, index),
      calculateManagementExpense(
        grossRevenueInCents,
        input.managementRatePercent ?? 0,
      ),
    ]);
    const netOperatingIncomeInCents = calculateNetOperatingIncome(
      effectiveGrossRevenueInCents,
      operatingExpensesInCents,
    );
    const mortgagePaymentsInCents = mortgageEntries.reduce(
      (total, entry) => total + entry.paymentInCents,
      0,
    );
    const principalRepaidInCents = mortgageEntries.reduce(
      (total, entry) => total + entry.principalInCents,
      0,
    );
    const interestPaidInCents = mortgageEntries.reduce(
      (total, entry) => total + entry.interestInCents,
      0,
    );
    const majorWorksInCents = input.majorWorks
      .filter((work) => work.year === year)
      .reduce((total, work) => total + work.amountInCents, 0);
    const cashFlowBeforeMajorWorksInCents = calculateCashFlowBeforeMajorWorks(
      netOperatingIncomeInCents,
      mortgagePaymentsInCents,
    );
    const cashFlowAfterMajorWorksBeforeAcquisitionCostsInCents =
      calculateCashFlowAfterMajorWorks(
        netOperatingIncomeInCents,
        mortgagePaymentsInCents,
        majorWorksInCents,
      );
    const acquisitionCostsInCents =
      year === 1 ? input.yearOneAcquisitionCostsInCents : 0;
    const cashFlowAfterMajorWorksInCents =
      cashFlowAfterMajorWorksBeforeAcquisitionCostsInCents -
      acquisitionCostsInCents;
    cumulativeCashFlowInCents += cashFlowAfterMajorWorksInCents;
    const mortgageBalanceInCents = mortgageEntries.at(-1)!.closingBalanceInCents;
    const estimatedPropertyValueInCents = input.appreciationEnabled
      ? input.analyzedPropertyValueInCents * Math.pow(appreciationFactor, year)
      : input.analyzedPropertyValueInCents;

    return {
      year,
      grossRevenueInCents,
      vacancyLossInCents,
      badDebtLossInCents,
      effectiveGrossRevenueInCents,
      operatingExpensesInCents,
      netOperatingIncomeInCents,
      mortgagePaymentsInCents,
      principalRepaidInCents,
      interestPaidInCents,
      majorWorksInCents,
      acquisitionCostsInCents,
      cashFlowBeforeMajorWorksInCents,
      cashFlowAfterMajorWorksInCents,
      cumulativeCashFlowInCents,
      mortgageBalanceInCents,
      estimatedPropertyValueInCents,
      estimatedEquityInCents:
        estimatedPropertyValueInCents - mortgageBalanceInCents,
    };
  });
}
