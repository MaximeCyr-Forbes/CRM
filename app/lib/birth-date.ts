export type BirthDateOrder = "day-first" | "month-first";

function isoToday(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const day = String(referenceDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validCalendarDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeBirthDate(
  rawValue: unknown,
  options: { order?: BirthDateOrder; today?: string } = {},
) {
  const value = String(rawValue ?? "").trim();
  if (!value) return "";

  let year = 0;
  let month = 0;
  let day = 0;
  const yearFirst = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  const local = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value);
  if (yearFirst) {
    [, year, month, day] = yearFirst.map(Number);
  } else if (local) {
    const first = Number(local[1]);
    const second = Number(local[2]);
    year = Number(local[3]);
    if ((options.order ?? "day-first") === "month-first") {
      month = first;
      day = second;
    } else {
      day = first;
      month = second;
    }
  } else {
    return "";
  }

  if (year < 1000 || !validCalendarDate(year, month, day)) return "";
  const normalized = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (normalized > (options.today ?? isoToday())) return "";
  return normalized;
}

export function inferBirthDateOrder(values: ReadonlyArray<string>): BirthDateOrder {
  let dayFirstEvidence = 0;
  let monthFirstEvidence = 0;
  for (const value of values) {
    const match = /^(\d{1,2})[./-](\d{1,2})[./-]\d{4}$/.exec(value.trim());
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first > 12 && second <= 12) dayFirstEvidence += 1;
    if (second > 12 && first <= 12) monthFirstEvidence += 1;
  }
  return monthFirstEvidence > dayFirstEvidence ? "month-first" : "day-first";
}

export function formatBirthDate(value: string, locale = "fr-CA") {
  const normalized = normalizeBirthDate(value);
  if (!normalized) return "Non renseigné";
  const [year, month, day] = normalized.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

export function birthDateYear(value: string) {
  const normalized = normalizeBirthDate(value);
  return normalized ? Number(normalized.slice(0, 4)) : null;
}
