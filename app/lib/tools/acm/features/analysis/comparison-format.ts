import type { PropertyListingStatus } from "@/app/lib/tools/acm/types";
import type { ComparisonRow, ComparisonValue } from "@/app/lib/tools/acm/features/comparables";
import { PROPERTY_STATUS_LABELS } from "./presentation";

export function formatComparisonValue(row: ComparisonRow, value: ComparisonValue): string {
  if (value === null || value === undefined || value === "") return "—";
  if (row.id === "status") return PROPERTY_STATUS_LABELS[value as PropertyListingStatus] ?? String(value);
  if (typeof value === "string") return value;
  if (row.id === "yearBuilt") return String(value);

  if (row.kind === "currency" || row.kind === "currency-decimal") {
    return new Intl.NumberFormat("fr-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: row.kind === "currency-decimal" ? 2 : 0,
    }).format(value);
  }
  if (row.kind === "ratio") {
    return `${new Intl.NumberFormat("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}×`;
  }
  return new Intl.NumberFormat("fr-CA", {
    maximumFractionDigits: row.kind === "integer" ? 0 : 2,
  }).format(value);
}
