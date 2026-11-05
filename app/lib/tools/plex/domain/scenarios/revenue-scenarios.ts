export type RevenueScenario = "current" | "potential" | "custom";

export interface ScenarioMonthlyRents {
  currentMonthlyRent: number;
  potentialMonthlyRent: number;
  customMonthlyRent: number;
}

export interface CurrentMonthlyRevenue extends ScenarioMonthlyRents {
  otherMonthlyIncome: number;
}

export const REVENUE_SCENARIO_LABELS: Record<RevenueScenario, string> = {
  current: "Revenus actuels",
  potential: "Revenus potentiels",
  custom: "Scénario personnalisé",
};

function hasUsablePotentialRent(rents: ScenarioMonthlyRents): boolean {
  return (
    Number.isFinite(rents.potentialMonthlyRent) &&
    rents.potentialMonthlyRent > 0
  );
}

/**
 * Retourne le loyer associé au scénario demandé. Dans le scénario potentiel,
 * le loyer potentiel remplace le loyer actuel lorsqu'il est renseigné; sinon,
 * le loyer actuel est conservé. Les deux montants ne sont jamais additionnés.
 */
export function getMonthlyRentForScenario(
  rents: ScenarioMonthlyRents,
  scenario: RevenueScenario,
): number {
  if (scenario === "potential") {
    return hasUsablePotentialRent(rents)
      ? rents.potentialMonthlyRent
      : rents.currentMonthlyRent;
  }
  if (scenario === "custom") return rents.customMonthlyRent;
  return rents.currentMonthlyRent;
}

/**
 * Construit la comparaison potentielle, logement par logement. Un loyer
 * potentiel valide remplace le loyer actuel correspondant; les autres
 * logements conservent leur loyer actuel.
 */
export function getPotentialMonthlyRentsWithCurrentFallback(
  rents: readonly ScenarioMonthlyRents[],
): number[] {
  return rents.map((rent) => getMonthlyRentForScenario(rent, "potential"));
}

/**
 * Retourne les revenus mensuels actuels, incluant les autres revenus réellement
 * saisis. Cette fonction ne consulte jamais les loyers potentiels ou personnalisés.
 */
export function getCurrentMonthlyRevenues(
  revenues: readonly CurrentMonthlyRevenue[],
): number[] {
  return revenues.map(
    (revenue) => revenue.currentMonthlyRent + revenue.otherMonthlyIncome,
  );
}
