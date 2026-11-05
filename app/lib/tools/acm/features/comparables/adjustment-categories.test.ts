import { describe, expect, it } from "vitest";
import type { PropertyCategory } from "@/app/lib/tools/acm/types";
import { getAdjustmentCategoryOptions } from "./adjustment-categories";

const categories: PropertyCategory[] = [
  "single_family",
  "condo",
  "farm",
  "commercial_industrial",
  "income_property",
  "land",
  "multi_category",
];

describe("configuration des catégories d'ajustement", () => {
  it.each(categories)("fournit une configuration centrale pour %s", (category) => {
    const options = getAdjustmentCategoryOptions(category);
    expect(options.length).toBeGreaterThan(0);
    expect(options.at(-1)?.value).toBe("other");
  });

  it("priorise les critères propres aux terrains", () => {
    expect(getAdjustmentCategoryOptions("land").slice(0, 5).map(({ value }) => value)).toEqual(["area", "zoning", "location", "services", "topography"]);
  });

  it("priorise les unités et revenus pour les propriétés à revenus", () => {
    expect(getAdjustmentCategoryOptions("income_property").slice(0, 4).map(({ value }) => value)).toEqual(["units", "revenue", "rents", "expenses"]);
  });

  it("priorise la superficie et l'étage pour les copropriétés", () => {
    expect(getAdjustmentCategoryOptions("condo").slice(0, 2).map(({ value }) => value)).toEqual(["area", "floor"]);
  });
});
