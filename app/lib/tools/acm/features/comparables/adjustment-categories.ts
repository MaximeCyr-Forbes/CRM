import type { AdjustmentCategory, PropertyCategory } from "@/app/lib/tools/acm/types";

export interface AdjustmentCategoryOption {
  value: AdjustmentCategory;
  label: string;
}

export const ADJUSTMENT_CATEGORY_LABELS: Record<AdjustmentCategory, string> = {
  location: "Localisation",
  land: "Terrain",
  area: "Superficie",
  year_age: "Année / âge",
  condition: "État général",
  renovations: "Rénovations",
  kitchen: "Cuisine",
  bathroom: "Salle de bains",
  bedrooms: "Chambres",
  garage: "Garage",
  parking: "Stationnement",
  basement: "Sous-sol",
  pool: "Piscine",
  revenue: "Revenus",
  units: "Nombre d’unités",
  rents: "Loyers",
  expenses: "Dépenses",
  zoning: "Zonage",
  services: "Services",
  topography: "Topographie",
  floor: "Étage",
  balcony: "Balcon",
  condo_fees: "Frais de copropriété",
  particularity: "Particularité",
  other: "Autre",
};

const RESIDENTIAL: AdjustmentCategory[] = [
  "location", "land", "area", "year_age", "condition", "renovations", "kitchen", "bathroom",
  "bedrooms", "garage", "parking", "basement", "pool", "particularity", "other",
];

const CATEGORY_PRIORITIES: Record<PropertyCategory, AdjustmentCategory[]> = {
  single_family: RESIDENTIAL,
  condo: ["area", "floor", "parking", "garage", "balcony", "condition", "condo_fees", "location", "renovations", "particularity", "other"],
  farm: ["land", "area", "location", "services", "topography", "condition", "renovations", "revenue", "particularity", "other"],
  commercial_industrial: ["location", "area", "land", "zoning", "services", "condition", "renovations", "parking", "revenue", "particularity", "other"],
  income_property: ["units", "revenue", "rents", "expenses", "condition", "parking", "garage", "land", "location", "renovations", "particularity", "other"],
  land: ["area", "zoning", "location", "services", "topography", "land", "particularity", "other"],
  multi_category: ["location", "land", "area", "zoning", "services", "condition", "renovations", "revenue", "units", "parking", "garage", "particularity", "other"],
};

export function getAdjustmentCategoryOptions(category: PropertyCategory | undefined): AdjustmentCategoryOption[] {
  const categories = category ? CATEGORY_PRIORITIES[category] : RESIDENTIAL;
  return categories.map((value) => ({ value, label: ADJUSTMENT_CATEGORY_LABELS[value] }));
}
