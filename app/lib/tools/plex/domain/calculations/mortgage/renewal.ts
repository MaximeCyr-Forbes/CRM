import { calculateCanadianFixedMortgage, generateMonthlyAmortizationSchedule } from "./calculator";
import { MortgageCalculationError } from "./errors";
import {
  calculateMonthlyMortgagePayment,
  convertCanadianNominalRateToMonthly,
} from "./rates";
import type { DownPaymentInput, MortgageScheduleEntry } from "./types";
import { assertNonNegative, assertPositiveInteger } from "./validation";

export const RENEWAL_PROJECTION_YEARS = 10;
const RENEWAL_PROJECTION_MONTHS = RENEWAL_PROJECTION_YEARS * 12;

export interface MortgageRenewalProjectionInput {
  purchasePriceInCents: number;
  downPayment: DownPaymentInput;
  initialAnnualNominalRatePercent: number;
  renewalAnnualNominalRatePercent: number;
  firstTermYears: number;
  amortizationYears: number;
  startDate: string;
}

export type MortgageRatePeriod = "initial" | "renewal";

export interface RenewalProjectionScheduleEntry extends MortgageScheduleEntry {
  projectionMonth: number;
  period: MortgageRatePeriod;
  annualNominalRatePercent: number;
}

export interface RenewalPeriodSummary {
  period: MortgageRatePeriod;
  startMonth: number;
  endMonth: number;
  annualNominalRatePercent: number;
  monthlyPaymentInCents: number;
  openingBalanceInCents: number;
  paymentsInCents: number;
  principalRepaidInCents: number;
  interestPaidInCents: number;
  closingBalanceInCents: number;
}

export interface MortgageRenewalProjectionResult {
  financedAmountInCents: number;
  renewalEffectiveDate: string;
  balanceAtRenewalInCents: number;
  remainingAmortizationMonthsAtRenewal: number;
  remainingAmortizationYearsAtRenewal: number;
  initialMonthlyPaymentInCents: number;
  renewalMonthlyPaymentInCents: number;
  initialPeriod: RenewalPeriodSummary;
  renewalPeriod: RenewalPeriodSummary;
  schedule: readonly RenewalProjectionScheduleEntry[];
  fullAmortizationSchedule: readonly RenewalProjectionScheduleEntry[];
  finalBalanceAfterTenYearsInCents: number;
}

function summarizePeriod(
  entries: readonly RenewalProjectionScheduleEntry[],
  monthlyPaymentInCents: number,
  annualNominalRatePercent: number,
): RenewalPeriodSummary {
  const first = entries[0];
  const last = entries[entries.length - 1];
  return {
    period: first.period,
    startMonth: first.projectionMonth,
    endMonth: last.projectionMonth,
    annualNominalRatePercent,
    monthlyPaymentInCents,
    openingBalanceInCents: first.openingBalanceInCents,
    paymentsInCents: entries.reduce((total, entry) => total + entry.paymentInCents, 0),
    principalRepaidInCents: entries.reduce(
      (total, entry) => total + entry.principalInCents,
      0,
    ),
    interestPaidInCents: entries.reduce(
      (total, entry) => total + entry.interestInCents,
      0,
    ),
    closingBalanceInCents: last.closingBalanceInCents,
  };
}

/**
 * Projette exactement dix ans avec un taux initial, puis un seul taux de
 * renouvellement appliqué au solde et à l’amortissement restant.
 */
export function calculateTenYearMortgageRenewalProjection(
  input: MortgageRenewalProjectionInput,
): MortgageRenewalProjectionResult {
  assertNonNegative(input.initialAnnualNominalRatePercent, "Le taux initial");
  assertNonNegative(input.renewalAnnualNominalRatePercent, "Le taux de renouvellement");
  assertPositiveInteger(input.firstTermYears, "La durée du premier terme");
  assertPositiveInteger(input.amortizationYears, "La période d’amortissement");

  if (input.firstTermYears >= RENEWAL_PROJECTION_YEARS) {
    throw new MortgageCalculationError(
      "INVALID_RENEWAL_TERM",
      "Le premier terme doit se terminer avant la fin de la projection de dix ans.",
    );
  }
  if (input.amortizationYears < RENEWAL_PROJECTION_YEARS) {
    throw new MortgageCalculationError(
      "PROJECTION_EXCEEDS_AMORTIZATION",
      "L’amortissement doit couvrir la projection complète de dix ans.",
    );
  }
  const initialMortgage = calculateCanadianFixedMortgage({
    purchasePriceInCents: input.purchasePriceInCents,
    downPayment: input.downPayment,
    annualNominalInterestRatePercent: input.initialAnnualNominalRatePercent,
    amortizationYears: input.amortizationYears,
    termYears: input.firstTermYears,
    startDate: input.startDate,
  });
  const firstTermMonths = input.firstTermYears * 12;
  const initialEntries = initialMortgage.amortizationSchedule
    .slice(0, firstTermMonths)
    .map<RenewalProjectionScheduleEntry>((entry, index) => ({
      ...entry,
      projectionMonth: index + 1,
      period: "initial",
      annualNominalRatePercent: input.initialAnnualNominalRatePercent,
    }));
  const balanceAtRenewalInCents = initialEntries.at(-1)!.closingBalanceInCents;
  const renewalEffectiveDate = initialEntries.at(-1)!.paymentDate;
  const remainingAmortizationMonthsAtRenewal =
    input.amortizationYears * 12 - firstTermMonths;
  const renewalMonthlyRate = convertCanadianNominalRateToMonthly(
    input.renewalAnnualNominalRatePercent,
  );
  const renewalMonthlyPaymentInCents = calculateMonthlyMortgagePayment(
    balanceAtRenewalInCents,
    renewalMonthlyRate,
    remainingAmortizationMonthsAtRenewal,
  );
  const renewalProjectionMonths = RENEWAL_PROJECTION_MONTHS - firstTermMonths;
  const fullRenewalEntries = generateMonthlyAmortizationSchedule(
    balanceAtRenewalInCents,
    renewalMonthlyRate,
    remainingAmortizationMonthsAtRenewal,
    renewalEffectiveDate,
  )
    .map<RenewalProjectionScheduleEntry>((entry, index) => ({
      ...entry,
      paymentNumber: firstTermMonths + index + 1,
      projectionMonth: firstTermMonths + index + 1,
      period: "renewal",
      annualNominalRatePercent: input.renewalAnnualNominalRatePercent,
    }));
  const renewalEntries = fullRenewalEntries.slice(0, renewalProjectionMonths);
  const schedule = [...initialEntries, ...renewalEntries];
  const fullAmortizationSchedule = [...initialEntries, ...fullRenewalEntries];
  const initialPeriod = summarizePeriod(
    initialEntries,
    initialMortgage.regularMonthlyPaymentInCents,
    input.initialAnnualNominalRatePercent,
  );
  const renewalPeriod = summarizePeriod(
    renewalEntries,
    renewalMonthlyPaymentInCents,
    input.renewalAnnualNominalRatePercent,
  );

  return {
    financedAmountInCents: initialMortgage.financedAmountInCents,
    renewalEffectiveDate,
    balanceAtRenewalInCents,
    remainingAmortizationMonthsAtRenewal,
    remainingAmortizationYearsAtRenewal:
      remainingAmortizationMonthsAtRenewal / 12,
    initialMonthlyPaymentInCents: initialMortgage.regularMonthlyPaymentInCents,
    renewalMonthlyPaymentInCents,
    initialPeriod,
    renewalPeriod,
    schedule,
    fullAmortizationSchedule,
    finalBalanceAfterTenYearsInCents: schedule.at(-1)!.closingBalanceInCents,
  };
}
