import { MortgageCalculationError } from "./errors";
import {
  calculateMonthlyMortgagePayment,
  convertCanadianNominalRateToMonthly,
} from "./rates";
import type {
  AnnualMortgageSummary,
  CanadianFixedMortgageInput,
  CanadianFixedMortgageResult,
  DownPaymentInput,
  MortgageScheduleEntry,
  MortgageTermSummary,
} from "./types";
import {
  assertNonNegative,
  assertPositiveInteger,
  parseIsoDate,
} from "./validation";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonthsClamped(date: Date, months: number): Date {
  const targetMonth = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(targetYear, normalizedMonth, Math.min(date.getUTCDate(), lastDay)),
  );
}

/** Convertit une mise de fonds en dollars ou en pourcentage vers un montant. */
export function resolveDownPaymentInCents(
  purchasePriceInCents: number,
  downPayment: DownPaymentInput,
): number {
  assertNonNegative(purchasePriceInCents, "Le prix d’achat");

  const resolved =
    downPayment.type === "amount"
      ? downPayment.valueInCents
      : purchasePriceInCents * (downPayment.valuePercent / 100);

  if (downPayment.type === "amount") {
    assertNonNegative(downPayment.valueInCents, "La mise de fonds");
  } else {
    assertNonNegative(downPayment.valuePercent, "Le pourcentage de mise de fonds");
    if (downPayment.valuePercent > 100) {
      throw new MortgageCalculationError(
        "DOWN_PAYMENT_EXCEEDS_PRICE",
        "La mise de fonds ne peut pas dépasser 100 % du prix d’achat.",
      );
    }
  }

  if (resolved > purchasePriceInCents) {
    throw new MortgageCalculationError(
      "DOWN_PAYMENT_EXCEEDS_PRICE",
      "La mise de fonds ne peut pas dépasser le prix d’achat.",
    );
  }
  return resolved;
}

/** Montant financé = prix d’achat − mise de fonds. */
export function calculateFinancedAmountInCents(
  purchasePriceInCents: number,
  downPaymentInCents: number,
): number {
  assertNonNegative(purchasePriceInCents, "Le prix d’achat");
  assertNonNegative(downPaymentInCents, "La mise de fonds");
  if (downPaymentInCents > purchasePriceInCents) {
    throw new MortgageCalculationError(
      "DOWN_PAYMENT_EXCEEDS_PRICE",
      "La mise de fonds ne peut pas dépasser le prix d’achat.",
    );
  }
  const financedAmount = purchasePriceInCents - downPaymentInCents;
  if (financedAmount === 0) {
    throw new MortgageCalculationError(
      "ZERO_FINANCED_AMOUNT",
      "Le montant financé doit être supérieur à zéro.",
    );
  }
  return financedAmount;
}

/** Génère l’échéancier mensuel complet, sans arrondir les montants intermédiaires. */
export function generateMonthlyAmortizationSchedule(
  financedAmountInCents: number,
  monthlyInterestRate: number,
  amortizationMonths: number,
  startDate: string,
): readonly MortgageScheduleEntry[] {
  const parsedStartDate = parseIsoDate(startDate);
  const regularPayment = calculateMonthlyMortgagePayment(
    financedAmountInCents,
    monthlyInterestRate,
    amortizationMonths,
  );
  const schedule: MortgageScheduleEntry[] = [];
  let balance = financedAmountInCents;

  for (let paymentNumber = 1; paymentNumber <= amortizationMonths; paymentNumber += 1) {
    const openingBalance = balance;
    const interest = openingBalance * monthlyInterestRate;
    const regularPrincipal = regularPayment - interest;
    const isFinalPayment =
      paymentNumber === amortizationMonths || regularPrincipal >= openingBalance;
    const principal = isFinalPayment ? openingBalance : regularPrincipal;
    const payment = principal + interest;
    balance = isFinalPayment ? 0 : openingBalance - principal;

    schedule.push({
      paymentNumber,
      paymentDate: toIsoDate(addMonthsClamped(parsedStartDate, paymentNumber)),
      openingBalanceInCents: openingBalance,
      paymentInCents: payment,
      principalInCents: principal,
      interestInCents: interest,
      closingBalanceInCents: balance,
    });

    if (isFinalPayment) {
      break;
    }
  }

  return schedule;
}

/** Regroupe exactement les lignes mensuelles par blocs de douze mois. */
export function createAnnualMortgageSummary(
  schedule: readonly MortgageScheduleEntry[],
): readonly AnnualMortgageSummary[] {
  const summaries: AnnualMortgageSummary[] = [];

  for (let offset = 0; offset < schedule.length; offset += 12) {
    const entries = schedule.slice(offset, offset + 12);
    const first = entries[0];
    const last = entries[entries.length - 1];
    summaries.push({
      yearNumber: summaries.length + 1,
      firstPaymentDate: first.paymentDate,
      lastPaymentDate: last.paymentDate,
      paymentsInCents: entries.reduce((total, entry) => total + entry.paymentInCents, 0),
      principalInCents: entries.reduce((total, entry) => total + entry.principalInCents, 0),
      interestInCents: entries.reduce((total, entry) => total + entry.interestInCents, 0),
      closingBalanceInCents: last.closingBalanceInCents,
    });
  }

  return summaries;
}

function createTermSummary(
  schedule: readonly MortgageScheduleEntry[],
  termMonths: number,
): MortgageTermSummary {
  const termEntries = schedule.slice(0, termMonths);
  const lastEntry = termEntries[termEntries.length - 1];
  return {
    months: termEntries.length,
    paymentsInCents: termEntries.reduce((total, entry) => total + entry.paymentInCents, 0),
    principalRepaidInCents: termEntries.reduce(
      (total, entry) => total + entry.principalInCents,
      0,
    ),
    interestPaidInCents: termEntries.reduce(
      (total, entry) => total + entry.interestInCents,
      0,
    ),
    remainingBalanceInCents: lastEntry.closingBalanceInCents,
  };
}

/**
 * Calcule une hypothèque canadienne à taux fixe, paiements mensuels et taux
 * nominal composé semestriellement.
 */
export function calculateCanadianFixedMortgage(
  input: CanadianFixedMortgageInput,
): CanadianFixedMortgageResult {
  assertNonNegative(input.purchasePriceInCents, "Le prix d’achat");
  assertNonNegative(
    input.annualNominalInterestRatePercent,
    "Le taux d’intérêt annuel nominal",
  );
  assertPositiveInteger(input.amortizationYears, "La période d’amortissement");
  assertPositiveInteger(input.termYears, "La durée du terme");
  parseIsoDate(input.startDate);

  if (input.termYears > input.amortizationYears) {
    throw new MortgageCalculationError(
      "TERM_EXCEEDS_AMORTIZATION",
      "Le terme ne peut pas dépasser la période d’amortissement.",
    );
  }

  const downPaymentInCents = resolveDownPaymentInCents(
    input.purchasePriceInCents,
    input.downPayment,
  );
  const financedAmountInCents = calculateFinancedAmountInCents(
    input.purchasePriceInCents,
    downPaymentInCents,
  );
  const monthlyInterestRate = convertCanadianNominalRateToMonthly(
    input.annualNominalInterestRatePercent,
  );
  const amortizationMonths = input.amortizationYears * 12;
  const termMonths = input.termYears * 12;
  const regularMonthlyPaymentInCents = calculateMonthlyMortgagePayment(
    financedAmountInCents,
    monthlyInterestRate,
    amortizationMonths,
  );
  const amortizationSchedule = generateMonthlyAmortizationSchedule(
    financedAmountInCents,
    monthlyInterestRate,
    amortizationMonths,
    input.startDate,
  );
  const annualSummary = createAnnualMortgageSummary(amortizationSchedule);
  const termSummary = createTermSummary(amortizationSchedule, termMonths);
  const totalPrincipalPaidInCents = amortizationSchedule.reduce(
    (total, entry) => total + entry.principalInCents,
    0,
  );
  const totalInterestPaidInCents = amortizationSchedule.reduce(
    (total, entry) => total + entry.interestInCents,
    0,
  );

  return {
    purchasePriceInCents: input.purchasePriceInCents,
    downPaymentInCents,
    downPaymentPercent: (downPaymentInCents / input.purchasePriceInCents) * 100,
    financedAmountInCents,
    monthlyInterestRate,
    regularMonthlyPaymentInCents,
    regularAnnualPaymentsInCents: regularMonthlyPaymentInCents * 12,
    principalRepaidInCents: termSummary.principalRepaidInCents,
    interestPaidInCents: termSummary.interestPaidInCents,
    remainingBalanceInCents: termSummary.remainingBalanceInCents,
    totalPrincipalPaidInCents,
    totalInterestPaidInCents,
    amortizationSchedule,
    annualSummary,
    termSummary,
  };
}
