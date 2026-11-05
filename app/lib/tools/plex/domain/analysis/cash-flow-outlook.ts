export type CashFlowOutlookColor = "green" | "yellow" | "red" | "neutral";

export interface CashFlowProjectionPoint {
  year: number;
  cashFlowAfterMajorWorksInCents: number;
}

export interface CashFlowOutlook {
  color: CashFlowOutlookColor;
  label: "Rentable" | "À vérifier" | "Revoir les données" | "Analyse en attente";
  explanation: string;
}

const PENDING_OUTLOOK: CashFlowOutlook = {
  color: "neutral",
  label: "Analyse en attente",
  explanation: "Complétez les données pour évaluer les flux des années 5 et 7.",
};

/**
 * Classe la projection selon le flux de trésorerie annuel après travaux majeurs.
 * L'année 5 positive est verte; sinon l'année 7 positive est jaune; lorsque
 * l'année 7 demeure nulle ou négative, le résultat est rouge.
 */
export function evaluateCashFlowOutlook(
  projection: readonly CashFlowProjectionPoint[],
): CashFlowOutlook {
  const yearFive = projection.find((entry) => entry.year === 5);
  const yearSeven = projection.find((entry) => entry.year === 7);

  if (
    yearFive === undefined ||
    yearSeven === undefined ||
    !Number.isFinite(yearFive.cashFlowAfterMajorWorksInCents) ||
    !Number.isFinite(yearSeven.cashFlowAfterMajorWorksInCents)
  ) {
    return PENDING_OUTLOOK;
  }

  if (yearFive.cashFlowAfterMajorWorksInCents > 0) {
    return {
      color: "green",
      label: "Rentable",
      explanation: "Le flux de trésorerie projeté est positif à l’année 5.",
    };
  }

  if (yearSeven.cashFlowAfterMajorWorksInCents > 0) {
    return {
      color: "yellow",
      label: "À vérifier",
      explanation: "Le flux devient positif à l’année 7, mais pas à l’année 5.",
    };
  }

  return {
    color: "red",
    label: "Revoir les données",
    explanation: "Le flux de trésorerie projeté est encore nul ou négatif à l’année 7.",
  };
}
