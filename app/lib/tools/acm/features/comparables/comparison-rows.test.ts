import { describe, expect, it } from "vitest";
import { getComparisonRows } from "./comparison-rows";

function ids(category: Parameters<typeof getComparisonRows>[0]) {
  return getComparisonRows(category).map((row) => row.id);
}

describe("lignes adaptatives du tableau comparatif", () => {
  it("inclut les chambres pour une propriété résidentielle", () => {
    expect(ids("single_family")).toContain("bedroomsTotal");
    expect(ids("single_family")).not.toContain("numberOfUnits");
  });

  it("inclut les métriques d'immeubles à revenus", () => {
    expect(ids("income_property")).toEqual(expect.arrayContaining(["numberOfUnits", "grossRevenue", "grossRevenueMultiplier", "pricePerDoor"]));
  });

  it("priorise les dimensions, le zonage et le prix au pied carré pour un terrain", () => {
    expect(ids("land")).toEqual(expect.arrayContaining(["landArea", "landDimensions", "zoning", "pricePerLandSquareFoot"]));
    expect(ids("land")).not.toContain("buildingArea");
  });

  it("prépare les données disponibles pour une propriété commerciale", () => {
    expect(ids("commercial_industrial")).toEqual(expect.arrayContaining(["propertyType", "buildingType", "zoning", "pricePerBuildingSquareFoot"]));
  });
});
