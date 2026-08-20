function validCalendarDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function normalizeMortgageRenewalDate(rawValue: unknown) {
  const value = String(rawValue ?? "").trim();
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  const [, year, month, day] = match.map(Number);
  return year >= 1000 && validCalendarDate(year, month, day) ? value : "";
}

export function formatMortgageRenewalDate(value: string, locale = "fr-CA") {
  const normalized = normalizeMortgageRenewalDate(value);
  if (!normalized) return "Non renseigné";
  const [year, month, day] = normalized.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
