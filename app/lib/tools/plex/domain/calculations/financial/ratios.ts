import { FinancialCalculationError } from "./errors";
import {
  assertFiniteNumber,
  assertNonNegativeAmount,
  assertNonZero,
  assertPurchasePrice,
} from "./validation";

/** MRB = prix d’achat analysé ÷ revenus bruts annuels. */
export function calculateGrossRentMultiplier(
  purchasePriceInCents: number,
  annualGrossRevenueInCents: number,
): number {
  assertPurchasePrice(purchasePriceInCents);
  assertNonNegativeAmount(annualGrossRevenueInCents, "Le revenu brut annuel");
  assertNonZero(annualGrossRevenueInCents, "Le revenu brut annuel");
  return purchasePriceInCents / annualGrossRevenueInCents;
}

/** MRN = prix d’achat analysé ÷ revenu net d’exploitation. */
export function calculateNetIncomeMultiplier(
  purchasePriceInCents: number,
  netOperatingIncomeInCents: number,
): number {
  assertPurchasePrice(purchasePriceInCents);
  assertFiniteNumber(netOperatingIncomeInCents, "Le revenu net d’exploitation");
  assertNonZero(netOperatingIncomeInCents, "Le revenu net d’exploitation");
  if (netOperatingIncomeInCents < 0) {
    throw new FinancialCalculationError(
      "NEGATIVE_NET_OPERATING_INCOME",
      "Le MRN n’est pas interprétable avec un revenu net d’exploitation négatif.",
    );
  }
  return purchasePriceInCents / netOperatingIncomeInCents;
}

/** Taux de capitalisation = revenu net d’exploitation ÷ prix analysé × 100. */
export function calculateCapitalizationRate(
  netOperatingIncomeInCents: number,
  purchasePriceInCents: number,
): number {
  assertFiniteNumber(netOperatingIncomeInCents, "Le revenu net d’exploitation");
  assertPurchasePrice(purchasePriceInCents);
  assertNonZero(purchasePriceInCents, "Le prix d’achat analysé");
  return (netOperatingIncomeInCents / purchasePriceInCents) * 100;
}

/** Ratio des dépenses = dépenses d’exploitation ÷ revenus bruts effectifs × 100. */
export function calculateExpenseRatio(
  operatingExpensesInCents: number,
  effectiveGrossRevenueInCents: number,
): number {
  assertNonNegativeAmount(operatingExpensesInCents, "Les dépenses d’exploitation");
  assertNonNegativeAmount(effectiveGrossRevenueInCents, "Le revenu brut effectif");
  assertNonZero(effectiveGrossRevenueInCents, "Le revenu brut effectif");
  return (operatingExpensesInCents / effectiveGrossRevenueInCents) * 100;
}

/** Marge d’exploitation = revenu net d’exploitation ÷ revenus bruts effectifs × 100. */
export function calculateOperatingMargin(
  netOperatingIncomeInCents: number,
  effectiveGrossRevenueInCents: number,
): number {
  assertFiniteNumber(netOperatingIncomeInCents, "Le revenu net d’exploitation");
  assertNonNegativeAmount(effectiveGrossRevenueInCents, "Le revenu brut effectif");
  assertNonZero(effectiveGrossRevenueInCents, "Le revenu brut effectif");
  return (netOperatingIncomeInCents / effectiveGrossRevenueInCents) * 100;
}

/** Coût par logement = prix d’achat analysé ÷ nombre de logements. */
export function calculateCostPerUnit(
  purchasePriceInCents: number,
  unitCount: number,
): number {
  assertPurchasePrice(purchasePriceInCents);
  assertFiniteNumber(unitCount, "Le nombre de logements");
  if (unitCount === 0) {
    throw new FinancialCalculationError(
      "ZERO_UNIT_COUNT",
      "Le nombre de logements ne peut pas être égal à zéro.",
    );
  }
  if (unitCount < 0) {
    throw new FinancialCalculationError(
      "NEGATIVE_AMOUNT",
      "Le nombre de logements ne peut pas être négatif.",
    );
  }
  if (!Number.isInteger(unitCount)) {
    throw new FinancialCalculationError(
      "INVALID_NUMBER",
      "Le nombre de logements doit être un entier.",
    );
  }
  return Math.round(purchasePriceInCents / unitCount);
}

/** DSCR = revenu net d’exploitation ÷ paiements hypothécaires annuels. */
export function calculateDebtServiceCoverageRatio(
  netOperatingIncomeInCents: number,
  annualMortgagePaymentsInCents: number,
): number {
  assertFiniteNumber(netOperatingIncomeInCents, "Le revenu net d’exploitation");
  assertNonNegativeAmount(
    annualMortgagePaymentsInCents,
    "Les paiements hypothécaires annuels",
  );
  assertNonZero(
    annualMortgagePaymentsInCents,
    "Les paiements hypothécaires annuels",
  );
  return netOperatingIncomeInCents / annualMortgagePaymentsInCents;
}
