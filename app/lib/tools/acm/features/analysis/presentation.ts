import type { FieldConfidence, ParsedProperty, PropertyArea, PropertyCategory, PropertyListingStatus } from "@/app/lib/tools/acm/types";
import { PROPERTY_CATEGORY_LABELS as SHARED_PROPERTY_CATEGORY_LABELS } from "@/app/lib/tools/acm/lib/constants/property-categories";

export const PROPERTY_CATEGORY_LABELS: Record<PropertyCategory, string> = SHARED_PROPERTY_CATEGORY_LABELS;

export const PROPERTY_STATUS_LABELS: Record<PropertyListingStatus, string> = {
  active: "En vigueur",
  sold: "Vendu",
  expired: "Expirée",
  withdrawn: "Retirée",
  unknown: "Non déterminé",
};

export const CONFIDENCE_LABELS: Record<FieldConfidence, string> = {
  high: "Élevée",
  medium: "Moyenne",
  low: "Faible",
};

export function getPropertySourceLabel(property: ParsedProperty): "Centris" | "JLR" | "Saisie manuelle" {
  if (property.sourceType === "manual") return "Saisie manuelle";
  return property.documentType === "jlr" ? "JLR" : "Centris";
}

export function formatCurrency(value?: number): string {
  if (value === undefined) return "Non détecté";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatArea(area?: PropertyArea): string {
  if (!area?.value) return "Non détectée";
  const value = new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(area.value);
  return `${value} ${area.unit === "sqm" ? "m²" : "pi²"}`;
}
