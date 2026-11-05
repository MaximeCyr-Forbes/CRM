import type { PropertyArea, PropertyCategory, PropertyData, PropertyDimensions } from "@/app/lib/tools/acm/types";
import type { DerivedPropertyMetrics } from "./metrics";
import { getGrossRevenue } from "./metrics";

export type ComparisonValue = string | number | null;
export type ComparisonValueKind = "text" | "currency" | "currency-decimal" | "integer" | "decimal" | "ratio";

export interface ComparisonRow {
  id: string;
  label: string;
  group: string;
  kind: ComparisonValueKind;
  value: (property: PropertyData, metrics: DerivedPropertyMetrics) => ComparisonValue;
}

function areaLabel(area: PropertyArea | undefined): string | null {
  if (!area?.value || !Number.isFinite(area.value) || !area.unit) return null;
  const formatted = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(area.value);
  return `${formatted} ${area.unit === "sqft" ? "pi²" : "m²"}`;
}

function dimensionsLabel(dimensions: PropertyDimensions | undefined): string | null {
  if (!dimensions?.width || !dimensions.depth || !dimensions.unit) return null;
  const number = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 });
  return `${number.format(dimensions.width)} × ${number.format(dimensions.depth)} ${dimensions.unit === "ft" ? "pi" : "m"}`;
}

const identificationRows: ComparisonRow[] = [
  { id: "address", label: "Adresse", group: "Identification", kind: "text", value: (property) => [property.address, property.city].filter(Boolean).join(", ") || null },
  { id: "status", label: "Statut", group: "Identification", kind: "text", value: (property) => property.status ?? null },
  { id: "askingPrice", label: "Prix demandé", group: "Prix", kind: "currency", value: (property) => property.askingPrice ?? null },
  { id: "soldPrice", label: "Prix vendu", group: "Prix", kind: "currency", value: (property) => property.soldPrice ?? null },
];

const physicalRows: ComparisonRow[] = [
  { id: "yearBuilt", label: "Année", group: "Propriété", kind: "integer", value: (property) => property.yearBuilt ?? null },
  { id: "landArea", label: "Superficie terrain", group: "Terrain et bâtiment", kind: "text", value: (property) => areaLabel(property.landArea) },
  { id: "buildingArea", label: "Superficie bâtiment", group: "Terrain et bâtiment", kind: "text", value: (property) => areaLabel(property.buildingArea) },
];

const assessmentRows: ComparisonRow[] = [
  { id: "municipalAssessment", label: "Évaluation municipale", group: "Évaluation", kind: "currency", value: (property) => property.municipalAssessment?.total ?? null },
  { id: "priceToAssessmentRatio", label: "Ratio prix / évaluation", group: "Métriques dérivées", kind: "ratio", value: (_, metrics) => metrics.priceToAssessmentRatio },
];

const residentialRows: ComparisonRow[] = [
  ...identificationRows,
  ...physicalRows,
  { id: "bedroomsTotal", label: "Chambres", group: "Caractéristiques", kind: "integer", value: (property) => property.bedroomsTotal ?? property.bedrooms ?? null },
  { id: "bathrooms", label: "Salles de bains", group: "Caractéristiques", kind: "integer", value: (property) => property.bathrooms ?? null },
  { id: "garage", label: "Garage", group: "Caractéristiques", kind: "text", value: (property) => property.garage ?? null },
  { id: "parking", label: "Stationnement", group: "Caractéristiques", kind: "integer", value: (property) => property.parking ?? null },
  { id: "basement", label: "Sous-sol", group: "Caractéristiques", kind: "text", value: (property) => property.basement ?? null },
  { id: "pool", label: "Piscine", group: "Caractéristiques", kind: "text", value: (property) => property.pool ?? null },
  ...assessmentRows,
  { id: "pricePerLandSquareFoot", label: "Prix / pi² terrain", group: "Métriques dérivées", kind: "currency-decimal", value: (_, metrics) => metrics.pricePerLandSquareFoot },
  { id: "pricePerBuildingSquareFoot", label: "Prix / pi² bâtiment", group: "Métriques dérivées", kind: "currency-decimal", value: (_, metrics) => metrics.pricePerBuildingSquareFoot },
];

const incomeRows: ComparisonRow[] = [
  ...identificationRows,
  ...physicalRows,
  { id: "numberOfUnits", label: "Nombre d’unités", group: "Revenus", kind: "integer", value: (property) => property.incomeProperty?.numberOfUnits ?? null },
  { id: "grossRevenue", label: "Revenus bruts potentiels", group: "Revenus", kind: "currency", value: (property) => getGrossRevenue(property) },
  { id: "operatingExpenses", label: "Dépenses d’exploitation", group: "Revenus", kind: "currency", value: (property) => property.incomeProperty?.operatingExpenses ?? null },
  { id: "netOperatingIncome", label: "Revenu net d’exploitation", group: "Revenus", kind: "currency", value: (property) => property.incomeProperty?.netOperatingIncome ?? null },
  { id: "grossRevenueMultiplier", label: "MRB", group: "Métriques dérivées", kind: "decimal", value: (_, metrics) => metrics.grossRevenueMultiplier },
  { id: "pricePerDoor", label: "Prix par porte", group: "Métriques dérivées", kind: "currency", value: (_, metrics) => metrics.pricePerDoor },
  ...assessmentRows,
  { id: "pricePerLandSquareFoot", label: "Prix / pi² terrain", group: "Métriques dérivées", kind: "currency-decimal", value: (_, metrics) => metrics.pricePerLandSquareFoot },
  { id: "pricePerBuildingSquareFoot", label: "Prix / pi² bâtiment", group: "Métriques dérivées", kind: "currency-decimal", value: (_, metrics) => metrics.pricePerBuildingSquareFoot },
];

const landRows: ComparisonRow[] = [
  ...identificationRows,
  { id: "landArea", label: "Superficie", group: "Terrain", kind: "text", value: (property) => areaLabel(property.landArea) },
  { id: "zoning", label: "Zonage", group: "Terrain", kind: "text", value: (property) => property.zoning?.join(", ") || null },
  { id: "landDimensions", label: "Dimensions", group: "Terrain", kind: "text", value: (property) => dimensionsLabel(property.landDimensions) },
  { id: "marketPrice", label: "Prix de référence", group: "Prix", kind: "currency", value: (_, metrics) => metrics.marketPrice },
  { id: "pricePerLandSquareFoot", label: "Prix / pi² terrain", group: "Métriques dérivées", kind: "currency-decimal", value: (_, metrics) => metrics.pricePerLandSquareFoot },
  ...assessmentRows,
];

const commercialRows: ComparisonRow[] = [
  ...identificationRows,
  { id: "propertyType", label: "Type de propriété", group: "Propriété", kind: "text", value: (property) => property.propertyType ?? null },
  { id: "buildingType", label: "Type de bâtiment", group: "Propriété", kind: "text", value: (property) => property.buildingType ?? null },
  ...physicalRows,
  { id: "zoning", label: "Zonage", group: "Propriété", kind: "text", value: (property) => property.zoning?.join(", ") || null },
  ...assessmentRows,
  { id: "pricePerLandSquareFoot", label: "Prix / pi² terrain", group: "Métriques dérivées", kind: "currency-decimal", value: (_, metrics) => metrics.pricePerLandSquareFoot },
  { id: "pricePerBuildingSquareFoot", label: "Prix / pi² bâtiment", group: "Métriques dérivées", kind: "currency-decimal", value: (_, metrics) => metrics.pricePerBuildingSquareFoot },
];

const multiCategoryRows: ComparisonRow[] = [
  ...commercialRows,
  { id: "numberOfUnits", label: "Nombre d’unités", group: "Revenus", kind: "integer", value: (property) => property.incomeProperty?.numberOfUnits ?? null },
  { id: "grossRevenue", label: "Revenus bruts potentiels", group: "Revenus", kind: "currency", value: (property) => getGrossRevenue(property) },
  { id: "operatingExpenses", label: "Dépenses d’exploitation", group: "Revenus", kind: "currency", value: (property) => property.incomeProperty?.operatingExpenses ?? null },
  { id: "netOperatingIncome", label: "Revenu net d’exploitation", group: "Revenus", kind: "currency", value: (property) => property.incomeProperty?.netOperatingIncome ?? null },
  { id: "grossRevenueMultiplier", label: "MRB", group: "Métriques dérivées", kind: "decimal", value: (_, metrics) => metrics.grossRevenueMultiplier },
  { id: "pricePerDoor", label: "Prix par porte", group: "Métriques dérivées", kind: "currency", value: (_, metrics) => metrics.pricePerDoor },
];

export function getComparisonRows(category: PropertyCategory | undefined): ComparisonRow[] {
  if (category === "income_property") return incomeRows;
  if (category === "land") return landRows;
  if (category === "commercial_industrial") return commercialRows;
  if (category === "multi_category") return multiCategoryRows;
  return residentialRows;
}
