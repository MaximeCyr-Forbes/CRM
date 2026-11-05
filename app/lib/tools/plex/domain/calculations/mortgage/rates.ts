import { assertNonNegative, assertPositiveInteger } from "./validation";

/**
 * Convertit le taux nominal canadien composé semestriellement en taux mensuel
 * équivalent : (1 + j/2)^(2/12) − 1.
 */
export function convertCanadianNominalRateToMonthly(
  annualNominalInterestRatePercent: number,
): number {
  assertNonNegative(
    annualNominalInterestRatePercent,
    "Le taux d’intérêt annuel nominal",
  );
  const nominalRate = annualNominalInterestRatePercent / 100;
  return Math.pow(1 + nominalRate / 2, 2 / 12) - 1;
}

/**
 * Calcule le paiement mensuel constant. Aucun arrondi monétaire n’est appliqué.
 */
export function calculateMonthlyMortgagePayment(
  financedAmountInCents: number,
  monthlyInterestRate: number,
  amortizationMonths: number,
): number {
  assertNonNegative(financedAmountInCents, "Le montant financé");
  assertNonNegative(monthlyInterestRate, "Le taux d’intérêt mensuel");
  assertPositiveInteger(amortizationMonths, "Le nombre de mois d’amortissement");

  if (monthlyInterestRate === 0) {
    return financedAmountInCents / amortizationMonths;
  }

  return (
    (financedAmountInCents * monthlyInterestRate) /
    (1 - Math.pow(1 + monthlyInterestRate, -amortizationMonths))
  );
}
