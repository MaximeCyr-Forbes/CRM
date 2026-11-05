import {
  assertNonNegativeAmount,
  assertPercentage,
  sumNonNegativeAmounts,
} from "./validation";

/** Additionne les revenus mensuels et les annualise. Les montants sont en cents. */
export function calculateAnnualGrossRevenue(
  monthlyRevenuesInCents: readonly number[],
): number {
  return sumNonNegativeAmounts(monthlyRevenuesInCents, "Le revenu mensuel") * 12;
}

/** Calcule la perte annuelle attribuable à la vacance. Le taux est exprimé de 0 à 100. */
export function calculateVacancyLoss(
  annualGrossRevenueInCents: number,
  vacancyRatePercent: number,
): number {
  assertNonNegativeAmount(annualGrossRevenueInCents, "Le revenu brut annuel");
  assertPercentage(vacancyRatePercent, "Le taux de vacance");
  return Math.round(annualGrossRevenueInCents * (vacancyRatePercent / 100));
}

/** Calcule les mauvaises créances annuelles selon un pourcentage des revenus bruts. */
export function calculateBadDebtLoss(
  annualGrossRevenueInCents: number,
  badDebtRatePercent: number,
): number {
  assertNonNegativeAmount(annualGrossRevenueInCents, "Le revenu brut annuel");
  assertPercentage(badDebtRatePercent, "Le taux de mauvaises créances");
  return Math.round(annualGrossRevenueInCents * (badDebtRatePercent / 100));
}

/** Revenus bruts effectifs = revenus bruts − vacance − mauvaises créances. */
export function calculateEffectiveGrossRevenue(
  annualGrossRevenueInCents: number,
  vacancyLossInCents: number,
  badDebtLossInCents: number,
): number {
  assertNonNegativeAmount(annualGrossRevenueInCents, "Le revenu brut annuel");
  assertNonNegativeAmount(vacancyLossInCents, "La perte de vacance");
  assertNonNegativeAmount(badDebtLossInCents, "Les mauvaises créances");
  const effectiveRevenue =
    annualGrossRevenueInCents - vacancyLossInCents - badDebtLossInCents;
  assertNonNegativeAmount(effectiveRevenue, "Le revenu brut effectif");
  return effectiveRevenue;
}

/** Additionne uniquement les dépenses d’exploitation courantes annuelles. */
export function calculateOperatingExpenses(
  annualOperatingExpensesInCents: readonly number[],
): number {
  return sumNonNegativeAmounts(
    annualOperatingExpensesInCents,
    "La dépense d’exploitation",
  );
}

/** Calcule les frais de gestion annuels comme pourcentage des revenus bruts annuels. */
export function calculateManagementExpense(
  annualGrossRevenueInCents: number,
  managementRatePercent: number,
): number {
  assertNonNegativeAmount(annualGrossRevenueInCents, "Le revenu brut annuel");
  assertPercentage(managementRatePercent, "Le taux de gestion");
  return Math.round(annualGrossRevenueInCents * (managementRatePercent / 100));
}

/**
 * Revenu net d’exploitation = revenus bruts effectifs − dépenses courantes.
 * Le résultat peut être négatif. Financement, acquisitions et travaux sont exclus.
 */
export function calculateNetOperatingIncome(
  effectiveGrossRevenueInCents: number,
  operatingExpensesInCents: number,
): number {
  assertNonNegativeAmount(effectiveGrossRevenueInCents, "Le revenu brut effectif");
  assertNonNegativeAmount(operatingExpensesInCents, "Les dépenses d’exploitation");
  return effectiveGrossRevenueInCents - operatingExpensesInCents;
}
