export type FollowUpPreset =
  | "today"
  | "tomorrow"
  | "three-days"
  | "one-week"
  | "one-month"
  | "custom"
  | "none";

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const result = startOfLocalDay(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addOneMonth(date: Date) {
  const source = startOfLocalDay(date);
  const targetMonth = source.getMonth() + 1;
  const targetYear = source.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();

  return new Date(
    targetYear,
    normalizedMonth,
    Math.min(source.getDate(), lastDayOfTargetMonth),
  );
}

export function toLocalISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function calculateFollowUpDate(
  preset: FollowUpPreset,
  customDate?: string,
  referenceDate = new Date(),
): string | null {
  switch (preset) {
    case "today":
      return toLocalISODate(startOfLocalDay(referenceDate));
    case "tomorrow":
      return toLocalISODate(addDays(referenceDate, 1));
    case "three-days":
      return toLocalISODate(addDays(referenceDate, 3));
    case "one-week":
      return toLocalISODate(addDays(referenceDate, 7));
    case "one-month":
      return toLocalISODate(addOneMonth(referenceDate));
    case "custom":
      return customDate || null;
    case "none":
      return null;
  }
}

export function formatFollowUpDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(localDate);
}
