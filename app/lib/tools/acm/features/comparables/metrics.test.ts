import { describe, expect, it } from "vitest";
import type { PropertyData } from "@/app/lib/tools/acm/types";
import { areaInSquareFeet, calculateDerivedMetrics, getGrossRevenue, getMarketPrice } from "./metrics";

describe("moteur de métriques dérivées", () => {
  it("privilégie le prix vendu lorsqu'il est disponible", () => {
    expect(getMarketPrice({ askingPrice: 650_000, soldPrice: 625_000 })).toBe(625_000);
  });

  it("utilise le prix demandé en l'absence d'un prix vendu", () => {
    expect(getMarketPrice({ askingPrice: 650_000 })).toBe(650_000);
  });

  it("convertit les mètres carrés en pieds carrés", () => {
    expect(areaInSquareFeet({ value: 100, unit: "sqm" })).toBeCloseTo(1076.391, 3);
  });

  it("additionne les revenus résidentiels et commerciaux explicites", () => {
    const property: PropertyData = { incomeProperty: { residentialRevenue: 40_000, commercialRevenue: 12_000 } };
    expect(getGrossRevenue(property)).toBe(52_000);
  });

  it("calcule toutes les métriques lorsque les données sont suffisantes", () => {
    const property: PropertyData = {
      askingPrice: 600_000,
      landArea: { value: 10_000, unit: "sqft" },
      buildingArea: { value: 2_000, unit: "sqft" },
      municipalAssessment: { total: 500_000 },
      incomeProperty: { numberOfUnits: 3, grossPotentialRevenue: 50_000 },
    };

    expect(calculateDerivedMetrics(property)).toMatchObject({
      marketPrice: 600_000,
      pricePerLandSquareFoot: 60,
      pricePerBuildingSquareFoot: 300,
      pricePerDoor: 200_000,
      priceToAssessmentRatio: 1.2,
      grossRevenueMultiplier: 12,
    });
  });

  it("retourne null plutôt qu'un zéro artificiel", () => {
    const metrics = calculateDerivedMetrics({
      askingPrice: 0,
      landArea: { value: 0, unit: "sqft" },
      municipalAssessment: { total: 0 },
      incomeProperty: { numberOfUnits: 0, grossPotentialRevenue: 0 },
    });

    expect(metrics.marketPrice).toBeNull();
    expect(metrics.pricePerLandSquareFoot).toBeNull();
    expect(metrics.pricePerDoor).toBeNull();
    expect(metrics.priceToAssessmentRatio).toBeNull();
    expect(metrics.grossRevenueMultiplier).toBeNull();
  });

  it("retourne null pour une métrique dont une donnée est absente", () => {
    const metrics = calculateDerivedMetrics({ soldPrice: 500_000 });
    expect(metrics.pricePerLandSquareFoot).toBeNull();
    expect(metrics.pricePerBuildingSquareFoot).toBeNull();
    expect(metrics.pricePerDoor).toBeNull();
  });
});
