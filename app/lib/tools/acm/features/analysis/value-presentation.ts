import type { ReferencePriceSource } from "@/app/lib/tools/acm/types";

const CURRENCY_FORMATTER = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export const REFERENCE_PRICE_SOURCE_LABELS: Record<ReferencePriceSource, string> = {
  sold_price: "Prix vendu utilisé",
  asking_price: "Prix demandé utilisé",
};

export function formatCmaCurrency(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? CURRENCY_FORMATTER.format(value) : "—";
}

export function formatSignedCurrency(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const formatted = CURRENCY_FORMATTER.format(Math.abs(value));
  if (value > 0) return `+ ${formatted}`;
  if (value < 0) return `− ${formatted}`;
  return formatted;
}
