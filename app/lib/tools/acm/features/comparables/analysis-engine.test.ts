import { describe, expect, it } from "vitest";
import type { ComparableAdjustment, ComparableAnalysis, MarketValueOpinion, ParsedProperty } from "@/app/lib/tools/acm/types";
import {
  buildComparableAnalysis,
  calculateAdjustedPriceStatistics,
  getReferencePrice,
  prepareCmaReportData,
  sumAdjustments,
  validateMarketValueOpinion,
} from "./analysis-engine";

const adjustments: ComparableAdjustment[] = [
  { id: "1", category: "land", description: "Terrain inférieur", amount: 20_000 },
  { id: "2", category: "garage", description: "Garage supérieur", amount: -10_000 },
  { id: "3", category: "condition", description: "État inférieur", amount: 15_000 },
];

function analysis(adjustedPrice: number | null, included = true): ComparableAnalysis {
  return {
    propertyId: String(adjustedPrice),
    referencePrice: adjustedPrice,
    referencePriceSource: adjustedPrice === null ? null : "sold_price",
    adjustments: [],
    totalAdjustments: 0,
    adjustedPrice,
    included,
  };
}

describe("ajustements des comparables", () => {
  it("additionne les ajustements positifs et négatifs", () => {
    expect(sumAdjustments(adjustments)).toBe(25_000);
  });

  it("conserve un ajustement entièrement positif", () => {
    expect(sumAdjustments([{ ...adjustments[0], amount: 15_000 }])).toBe(15_000);
  });

  it("conserve un ajustement entièrement négatif", () => {
    expect(sumAdjustments([{ ...adjustments[0], amount: -10_000 }])).toBe(-10_000);
  });

  it("ignore un montant incomplet plutôt que de produire une valeur invalide", () => {
    expect(sumAdjustments([{ ...adjustments[0], amount: null }])).toBe(0);
  });

  it("calcule le prix ajusté sans modifier le prix de référence", () => {
    const result = buildComparableAnalysis("comparable", { soldPrice: 600_000 }, adjustments);
    expect(result.referencePrice).toBe(600_000);
    expect(result.totalAdjustments).toBe(25_000);
    expect(result.adjustedPrice).toBe(625_000);
  });

  it("privilégie le prix vendu", () => {
    expect(getReferencePrice({ soldPrice: 590_000, askingPrice: 610_000 })).toEqual({ price: 590_000, source: "sold_price" });
  });

  it("utilise le prix demandé si aucun prix vendu n'est disponible", () => {
    expect(getReferencePrice({ askingPrice: 610_000 })).toEqual({ price: 610_000, source: "asking_price" });
  });

  it("tolère une propriété sans prix exploitable", () => {
    expect(buildComparableAnalysis("sans-prix", {}, adjustments).adjustedPrice).toBeNull();
  });
});

describe("statistiques des prix ajustés", () => {
  it("calcule minimum, maximum, moyenne et médiane", () => {
    expect(calculateAdjustedPriceStatistics([analysis(600_000), analysis(650_000), analysis(700_000)])).toEqual({
      count: 3,
      minimum: 600_000,
      maximum: 700_000,
      average: 650_000,
      median: 650_000,
    });
  });

  it("calcule la médiane d'un nombre pair de comparables", () => {
    expect(calculateAdjustedPriceStatistics([analysis(600_000), analysis(650_000)]).median).toBe(625_000);
  });

  it("ignore les comparables exclus et ceux sans prix", () => {
    expect(calculateAdjustedPriceStatistics([analysis(600_000), analysis(800_000, false), analysis(null)])).toEqual({
      count: 1,
      minimum: 600_000,
      maximum: 600_000,
      average: 600_000,
      median: 600_000,
    });
  });
});

describe("opinion de valeur", () => {
  it("accepte une recommandation manuelle valide différente du milieu", () => {
    const opinion: MarketValueOpinion = { minimumValue: 625_000, maximumValue: 650_000, recommendedValue: 639_000, brokerComment: "" };
    expect(validateMarketValueOpinion(opinion)).toEqual({});
  });

  it("signale une valeur minimale négative", () => {
    expect(validateMarketValueOpinion({ minimumValue: -1, brokerComment: "" }).minimumValue).toBeDefined();
  });

  it("signale un maximum inférieur au minimum", () => {
    expect(validateMarketValueOpinion({ minimumValue: 650_000, maximumValue: 625_000, brokerComment: "" }).maximumValue).toBeDefined();
  });

  it("signale une recommandation hors de la fourchette", () => {
    expect(validateMarketValueOpinion({ minimumValue: 625_000, maximumValue: 650_000, recommendedValue: 700_000, brokerComment: "" }).recommendedValue).toBeDefined();
  });

  it("valide une recommandation contre une seule borne déjà saisie", () => {
    expect(validateMarketValueOpinion({ maximumValue: 650_000, recommendedValue: 700_000, brokerComment: "" }).recommendedValue).toBeDefined();
  });

  it("prépare un rapport avec seulement les comparables inclus", () => {
    const property = (id: string): ParsedProperty => ({ id, sourceFile: `${id}.pdf`, data: { askingPrice: 500_000 }, fieldConfidence: {}, overallConfidence: "high", pageCount: 1, warnings: [] });
    const report = prepareCmaReportData(property("subject"), [property("included")], {}, { brokerComment: "Analyse manuelle" });
    expect(report.subject.id).toBe("subject");
    expect(report.comparables.map(({ property: item }) => item.id)).toEqual(["included"]);
    expect(report.statistics.count).toBe(1);
    expect(report.opinion.brokerComment).toBe("Analyse manuelle");
  });
});
