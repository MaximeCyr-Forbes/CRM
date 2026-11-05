import {
  assertFiniteNumber,
  assertNonNegativeAmount,
  assertNonZero,
  sumNonNegativeAmounts,
} from "./validation";

/** Flux avant travaux majeurs = RNO − paiements hypothécaires annuels. */
export function calculateCashFlowBeforeMajorWorks(
  netOperatingIncomeInCents: number,
  annualMortgagePaymentsInCents: number,
): number {
  assertFiniteNumber(netOperatingIncomeInCents, "Le revenu net d’exploitation");
  assertNonNegativeAmount(
    annualMortgagePaymentsInCents,
    "Les paiements hypothécaires annuels",
  );
  return netOperatingIncomeInCents - annualMortgagePaymentsInCents;
}

/** Flux après travaux majeurs = RNO − hypothèque − travaux majeurs de l’année. */
export function calculateCashFlowAfterMajorWorks(
  netOperatingIncomeInCents: number,
  annualMortgagePaymentsInCents: number,
  annualMajorWorksInCents: number,
): number {
  assertFiniteNumber(netOperatingIncomeInCents, "Le revenu net d’exploitation");
  assertNonNegativeAmount(
    annualMortgagePaymentsInCents,
    "Les paiements hypothécaires annuels",
  );
  assertNonNegativeAmount(annualMajorWorksInCents, "Les travaux majeurs annuels");
  return (
    netOperatingIncomeInCents -
    annualMortgagePaymentsInCents -
    annualMajorWorksInCents
  );
}

/** Rendement sur mise de fonds = flux annuel ÷ mise de fonds × 100. */
export function calculateDownPaymentReturn(
  annualCashFlowInCents: number,
  downPaymentInCents: number,
): number {
  assertFiniteNumber(annualCashFlowInCents, "Le flux de trésorerie annuel");
  assertNonNegativeAmount(downPaymentInCents, "La mise de fonds");
  assertNonZero(downPaymentInCents, "La mise de fonds");
  return (annualCashFlowInCents / downPaymentInCents) * 100;
}

/**
 * Investissement initial = mise de fonds + frais d’acquisition + travaux
 * immédiats + réserves initiales.
 */
export function calculateInitialInvestment(
  downPaymentInCents: number,
  acquisitionCostsInCents: readonly number[],
  immediateWorksInCents: readonly number[],
  initialReservesInCents: number,
): number {
  assertNonNegativeAmount(downPaymentInCents, "La mise de fonds");
  assertNonNegativeAmount(initialReservesInCents, "Les réserves initiales");
  return (
    downPaymentInCents +
    sumNonNegativeAmounts(acquisitionCostsInCents, "Le frais d’acquisition") +
    sumNonNegativeAmounts(immediateWorksInCents, "Le travail immédiat") +
    initialReservesInCents
  );
}

/** Rendement initial = flux annuel ÷ investissement initial total × 100. */
export function calculateInitialInvestmentReturn(
  annualCashFlowInCents: number,
  initialInvestmentInCents: number,
): number {
  assertFiniteNumber(annualCashFlowInCents, "Le flux de trésorerie annuel");
  assertNonNegativeAmount(
    initialInvestmentInCents,
    "L’investissement initial total",
  );
  assertNonZero(initialInvestmentInCents, "L’investissement initial total");
  return (annualCashFlowInCents / initialInvestmentInCents) * 100;
}
