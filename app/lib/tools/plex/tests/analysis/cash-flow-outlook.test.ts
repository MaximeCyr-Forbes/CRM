import { describe, expect, it } from "vitest";
import { evaluateCashFlowOutlook } from "@/app/lib/tools/plex/domain/analysis";

const projection = (yearFiveCashFlow: number, yearSevenCashFlow: number) => [
  { year: 5, cashFlowAfterMajorWorksInCents: yearFiveCashFlow },
  { year: 7, cashFlowAfterMajorWorksInCents: yearSevenCashFlow },
];

describe("indicateur de rentabilité à 5 et 7 ans", () => {
  it("affiche Rentable en vert lorsque l'année 5 est positive", () => {
    expect(evaluateCashFlowOutlook(projection(1, -1))).toMatchObject({
      color: "green",
      label: "Rentable",
    });
  });

  it("affiche À vérifier en jaune lorsque seule l'année 7 est positive", () => {
    expect(evaluateCashFlowOutlook(projection(-1, 1))).toMatchObject({
      color: "yellow",
      label: "À vérifier",
    });
  });

  it("affiche Revoir les données en rouge lorsque l'année 7 reste négative", () => {
    expect(evaluateCashFlowOutlook(projection(-1, -1))).toMatchObject({
      color: "red",
      label: "Revoir les données",
    });
  });

  it("considère un flux nul comme non positif", () => {
    expect(evaluateCashFlowOutlook(projection(0, 0))).toMatchObject({
      color: "red",
      label: "Revoir les données",
    });
  });

  it("reste neutre lorsque la projection est absente ou invalide", () => {
    expect(evaluateCashFlowOutlook([])).toMatchObject({
      color: "neutral",
      label: "Analyse en attente",
    });
    expect(evaluateCashFlowOutlook(projection(Number.NaN, 1))).toMatchObject({
      color: "neutral",
      label: "Analyse en attente",
    });
  });
});
