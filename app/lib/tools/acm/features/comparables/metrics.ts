import type { PropertyArea, PropertyData } from "@/app/lib/tools/acm/types";

const SQUARE_METERS_TO_SQUARE_FEET = 10.7639104167;

export interface DerivedPropertyMetrics {
  marketPrice: number | null;
  landAreaSquareFeet: number | null;
  buildingAreaSquareFeet: number | null;
  pricePerLandSquareFoot: number | null;
  pricePerBuildingSquareFoot: number | null;
  pricePerDoor: number | null;
  priceToAssessmentRatio: number | null;
  grossRevenueMultiplier: number | null;
}

function positiveNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function divide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  return numerator / denominator;
}

export function getMarketPrice(property: PropertyData): number | null {
  return positiveNumber(property.soldPrice) ?? positiveNumber(property.askingPrice);
}

export function areaInSquareFeet(area: PropertyArea | undefined): number | null {
  const value = positiveNumber(area?.value);
  if (value === null || !area?.unit) return null;
  return area.unit === "sqm" ? value * SQUARE_METERS_TO_SQUARE_FEET : value;
}

export function getGrossRevenue(property: PropertyData): number | null {
  const explicitRevenue = positiveNumber(property.incomeProperty?.grossPotentialRevenue);
  if (explicitRevenue !== null) return explicitRevenue;

  const residential = positiveNumber(property.incomeProperty?.residentialRevenue);
  const commercial = positiveNumber(property.incomeProperty?.commercialRevenue);
  if (residential === null && commercial === null) return null;
  return (residential ?? 0) + (commercial ?? 0);
}

export function calculateDerivedMetrics(property: PropertyData): DerivedPropertyMetrics {
  const marketPrice = getMarketPrice(property);
  const landAreaSquareFeet = areaInSquareFeet(property.landArea);
  const buildingAreaSquareFeet = areaInSquareFeet(property.buildingArea);
  const numberOfUnits = positiveNumber(property.incomeProperty?.numberOfUnits);
  const assessment = positiveNumber(property.municipalAssessment?.total);
  const grossRevenue = getGrossRevenue(property);

  return {
    marketPrice,
    landAreaSquareFeet,
    buildingAreaSquareFeet,
    pricePerLandSquareFoot: divide(marketPrice, landAreaSquareFeet),
    pricePerBuildingSquareFoot: divide(marketPrice, buildingAreaSquareFeet),
    pricePerDoor: divide(marketPrice, numberOfUnits),
    priceToAssessmentRatio: divide(marketPrice, assessment),
    grossRevenueMultiplier: divide(marketPrice, grossRevenue),
  };
}
