export function formatYear(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return String(Math.trunc(value));
}
