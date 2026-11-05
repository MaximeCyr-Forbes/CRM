import type { CmaReportData, ComparableAdjustment, ParsedProperty, PropertyCategory, PropertyData } from "../../types";
import { buildComparableAnalysis, calculateAdjustedPriceStatistics } from "../comparables";

function parsedProperty(id: string, data: PropertyData): ParsedProperty {
  return {
    id,
    sourceFile: `${id}.pdf`,
    data,
    fieldConfidence: {},
    overallConfidence: "high",
    pageCount: 1,
    warnings: [],
  };
}

export function createReportFixture(options: {
  category?: PropertyCategory;
  comparableCount?: number;
  withoutPhotos?: boolean;
  withoutComment?: boolean;
  adjustments?: ComparableAdjustment[];
} = {}): CmaReportData {
  const category = options.category ?? "single_family";
  const subject = parsedProperty("subject", {
    address: "373 4e Avenue",
    city: "Deux-Montagnes",
    centrisNumber: "12345678",
    propertyCategory: category,
    propertyType: category === "income_property" ? "Triplex" : "Maison de plain-pied",
    yearBuilt: 1976,
    landArea: { value: 8_500, unit: "sqft" },
    buildingArea: { value: 1_450, unit: "sqft" },
    bedroomsTotal: 3,
    bathrooms: 2,
    garage: "Simple",
    parking: 4,
    zoning: ["Résidentiel"],
    cadastre: "1 234 567",
    incomeProperty: category === "income_property" ? {
      numberOfUnits: 3,
      grossPotentialRevenue: 48_000,
      operatingExpenses: 8_000,
      netOperatingIncome: 40_000,
      grossRevenueMultiplier: 12.5,
      rents: [{ unit: "1", monthlyRent: 1_200 }],
    } : undefined,
    photos: options.withoutPhotos ? undefined : [],
  });

  const comparableCount = options.comparableCount ?? 1;
  const adjustments = options.adjustments ?? [
    { id: "a1", category: "land", description: "Terrain inférieur", amount: 20_000 },
    { id: "a2", category: "garage", description: "Garage supérieur", amount: -10_000 },
  ];
  const comparables = Array.from({ length: comparableCount }, (_, index) => {
    const property = parsedProperty(`comparable-${index + 1}`, {
      address: `${100 + index} Rue Exemple`,
      city: "Deux-Montagnes",
      centrisNumber: `8765432${index}`,
      status: index % 2 === 0 ? "sold" : "active",
      propertyCategory: category,
      propertyType: subject.data.propertyType,
      askingPrice: 610_000 + index * 20_000,
      soldPrice: index % 2 === 0 ? 600_000 + index * 20_000 : undefined,
      yearBuilt: 1975 + index,
      landArea: { value: 8_000 + index * 300, unit: "sqft" },
      buildingArea: { value: 1_400 + index * 50, unit: "sqft" },
      bedroomsTotal: 3,
      bathrooms: 2,
      garage: "Simple",
      parking: 3,
      incomeProperty: category === "income_property" ? {
        numberOfUnits: 3,
        grossPotentialRevenue: 45_000 + index * 2_000,
        operatingExpenses: 7_000,
        netOperatingIncome: 38_000 + index * 2_000,
      } : undefined,
    });
    return { property, analysis: buildComparableAnalysis(property.id, property.data, adjustments, true) };
  });

  return {
    preparedBy: "maxime",
    subject,
    comparables,
    statistics: calculateAdjustedPriceStatistics(comparables.map(({ analysis }) => analysis)),
    opinion: {
      minimumValue: 625_000,
      maximumValue: 650_000,
      recommendedValue: 639_000,
      brokerComment: options.withoutComment ? "" : "Opinion rédigée manuellement par le courtier.",
    },
  };
}
