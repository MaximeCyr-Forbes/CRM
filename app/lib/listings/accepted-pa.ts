import type { ListingAcceptedPaInput } from "../../data/listing-types";

function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function optionalUuid(value: unknown): value is string | null {
  return value === null || (
    typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function parseListingAcceptedPaInput(value: unknown): ListingAcceptedPaInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    !optionalUuid(data.offerId)
    || typeof data.amount !== "number"
    || !Number.isFinite(data.amount)
    || data.amount <= 0
    || !validCalendarDate(data.offerDate)
    || typeof data.buyerNames !== "string"
  ) return null;
  return {
    offerId: data.offerId,
    amount: data.amount,
    offerDate: data.offerDate,
    buyerNames: data.buyerNames.trim(),
  };
}
