import type { PropertyCategory } from "@/app/lib/tools/acm/types";

export const PROPERTY_CATEGORY_LABELS: Record<PropertyCategory, string> = {
  single_family: "Unifamiliale",
  condo: "Copropriété / Appartement résidentiel",
  farm: "Ferme / Fermette",
  commercial_industrial: "Propriété commerciale ou industrielle",
  income_property: "Propriété à revenus",
  land: "Terre / Terrain",
  multi_category: "Multicatégories",
};
