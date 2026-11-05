import { describe, expect, it } from "vitest";
import { categorizeProperty } from "./categorize";

describe("categorizeProperty", () => {
  it.each([
    ["Maison de plain-pied", "single_family"],
    ["Appartement en copropriété divise", "condo"],
    ["Fermette", "farm"],
    ["Bâtiment industriel", "commercial_industrial"],
    ["Triplex", "income_property"],
    ["Terrain vacant", "land"],
    ["Terrain", "land"],
    ["Immeuble résidentiel et commercial", "multi_category"],
  ] as const)("classe %s dans %s", (propertyType, expected) => {
    expect(categorizeProperty(propertyType).category).toBe(expected);
  });

  it("ne choisit rien lorsqu'aucun terme n'est déterminant", () => {
    expect(categorizeProperty("Bâtiment", undefined, "Près d'un commerce et d'une ferme").category).toBeUndefined();
  });
});
