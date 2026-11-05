import { describe, expect, it } from "vitest";
import {
  conclusionColor,
  determineConclusion,
  evaluateIndicator,
  evaluateMaximumBandIndicator,
} from "@/app/lib/tools/plex/domain/analysis";

const minimum = (value: number | null, threshold = 5) =>
  evaluateIndicator({ id: "cap", label: "Capitalisation", value, threshold, direction: "minimum" });
const maximum = (value: number | null, threshold = 10) =>
  evaluateIndicator({ id: "mrb", label: "MRB", value, threshold, direction: "maximum" });

describe("indicateurs d’analyse", () => {
  it("est vert lorsque le minimum est atteint", () => {
    expect(minimum(5).color).toBe("green");
    expect(minimum(6).color).toBe("green");
  });

  it("est vert lorsque le maximum est respecté", () => {
    expect(maximum(10).color).toBe("green");
    expect(maximum(8).color).toBe("green");
  });

  it("est jaune dans la zone visible de 10 %", () => {
    expect(minimum(4.5).color).toBe("yellow");
    expect(maximum(11).color).toBe("yellow");
  });

  it("est rouge au-delà de la zone jaune", () => {
    expect(minimum(4.49).color).toBe("red");
    expect(maximum(11.01).color).toBe("red");
  });

  it("est jaune et incomplet lorsqu’une donnée manque", () => {
    const result = minimum(null);
    expect(result.color).toBe("yellow");
    expect(result.dataQuality).toBe("missing");
    expect(determineConclusion([result])).toBe("Données insuffisantes pour conclure");
  });

  it("conserve la couleur du seuil tout en signalant une donnée non confirmée", () => {
    const result = evaluateIndicator({
      id: "cap",
      label: "Capitalisation",
      value: 8,
      threshold: 5,
      direction: "minimum",
      dataQuality: "unconfirmed",
    });
    expect(result.color).toBe("green");
    expect(result.explanation).toContain("Données non confirmées");
    expect(determineConclusion([result])).toBe("Analyse prudente recommandée");
  });

  it.each([
    [1, "green"],
    [15.99, "green"],
    [16, "green"],
    [16.01, "yellow"],
    [21, "yellow"],
    [21.99, "yellow"],
    [22, "red"],
    [100, "red"],
  ] as const)("classe le MRB %s dans la zone %s", (value, color) => {
    const result = evaluateMaximumBandIndicator({
      id: "mrb",
      label: "MRB",
      value,
      greenMaximum: 16,
      redMinimum: 22,
    });
    expect(result.color).toBe(color);
  });

  it("applique immédiatement les deux seuils MRB sélectionnés", () => {
    expect(evaluateMaximumBandIndicator({
      id: "mrb",
      label: "MRB",
      value: 18,
      greenMaximum: 16,
      redMinimum: 22,
    }).color).toBe("yellow");
    expect(evaluateMaximumBandIndicator({
      id: "mrb",
      label: "MRB",
      value: 18,
      greenMaximum: 18,
      redMinimum: 22,
    }).color).toBe("green");
    expect(evaluateMaximumBandIndicator({
      id: "mrb",
      label: "MRB",
      value: 18,
      greenMaximum: 16,
      redMinimum: 18,
    }).color).toBe("red");
  });

  it("signale deux seuils MRB qui se chevauchent au lieu de masquer l’erreur", () => {
    const result = evaluateMaximumBandIndicator({
      id: "mrb",
      label: "MRB",
      value: 18,
      greenMaximum: 22,
      redMinimum: 16,
    });

    expect(result.color).toBe("yellow");
    expect(result.dataQuality).toBe("missing");
    expect(result.explanation).toContain("Seuils MRB invalides");
    expect(determineConclusion([result])).toBe("Données insuffisantes pour conclure");
  });

  it("garde un MRB rouge même si sa source doit être vérifiée", () => {
    const result = evaluateMaximumBandIndicator({
      id: "mrb",
      label: "MRB",
      value: 23,
      greenMaximum: 16,
      redMinimum: 22,
      dataQuality: "unconfirmed",
    });
    expect(result.color).toBe("red");
    expect(determineConclusion([result])).toBe("Ne respecte pas les critères sélectionnés");
  });

  it("affiche la couleur numérique mais bloque le résultat global si une donnée essentielle manque", () => {
    const result = evaluateMaximumBandIndicator({
      id: "mrb",
      label: "MRB",
      value: 15,
      greenMaximum: 16,
      redMinimum: 22,
      dataQuality: "missing",
    });
    expect(result.color).toBe("green");
    expect(determineConclusion([result])).toBe("Données insuffisantes pour conclure");
  });

  it("applique la règle globale visible sans masquer un rouge", () => {
    const green = minimum(6);
    const yellow = minimum(4.8);
    const red = minimum(3);
    expect(determineConclusion([green])).toContain("Opportunité");
    expect(determineConclusion([green, yellow])).toBe("Analyse prudente recommandée");
    expect(determineConclusion([green, red])).toBe("Ne respecte pas les critères sélectionnés");
    expect(conclusionColor(determineConclusion([green, red]))).toBe("red");
  });
});
