export type DownPaymentInput =
  | { type: "amount"; valueInCents: number }
  | { type: "percentage"; valuePercent: number };

export interface CanadianFixedMortgageInput {
  purchasePriceInCents: number;
  downPayment: DownPaymentInput;
  annualNominalInterestRatePercent: number;
  amortizationYears: number;
  termYears: number;
  /** Date ISO civile au format AAAA-MM-JJ. */
  startDate: string;
}

export interface MortgageScheduleEntry {
  paymentNumber: number;
  paymentDate: string;
  openingBalanceInCents: number;
  paymentInCents: number;
  principalInCents: number;
  interestInCents: number;
  closingBalanceInCents: number;
}

export interface AnnualMortgageSummary {
  yearNumber: number;
  firstPaymentDate: string;
  lastPaymentDate: string;
  paymentsInCents: number;
  principalInCents: number;
  interestInCents: number;
  closingBalanceInCents: number;
}

export interface MortgageTermSummary {
  months: number;
  paymentsInCents: number;
  principalRepaidInCents: number;
  interestPaidInCents: number;
  remainingBalanceInCents: number;
}

export interface CanadianFixedMortgageResult {
  purchasePriceInCents: number;
  downPaymentInCents: number;
  downPaymentPercent: number;
  financedAmountInCents: number;
  monthlyInterestRate: number;
  regularMonthlyPaymentInCents: number;
  regularAnnualPaymentsInCents: number;
  principalRepaidInCents: number;
  interestPaidInCents: number;
  remainingBalanceInCents: number;
  totalPrincipalPaidInCents: number;
  totalInterestPaidInCents: number;
  amortizationSchedule: readonly MortgageScheduleEntry[];
  annualSummary: readonly AnnualMortgageSummary[];
  termSummary: MortgageTermSummary;
}
