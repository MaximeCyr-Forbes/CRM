export const TRANSACTION_DEADLINE_TIME_ZONE = "America/Toronto";

const APP_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATABASE_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/;

export function isTransactionDeadlineTime(value: unknown): value is string {
  return typeof value === "string" && APP_TIME_PATTERN.test(value);
}

export function parseTransactionDeadlineTimeInput(
  value: unknown,
): { valid: true; value: string | null | undefined } | { valid: false } {
  if (value === undefined) return { valid: true, value: undefined };
  if (value === null || value === "") return { valid: true, value: null };
  return isTransactionDeadlineTime(value) ? { valid: true, value } : { valid: false };
}

export function normalizeTransactionDeadlineTime(value: string | null | undefined) {
  if (!value) return null;
  const match = DATABASE_TIME_PATTERN.exec(value);
  return match ? `${match[1]}:${match[2]}` : null;
}

export function compareTransactionDeadlines(
  left: { dueDate: string; dueTime: string | null; id: string },
  right: { dueDate: string; dueTime: string | null; id: string },
) {
  return left.dueDate.localeCompare(right.dueDate)
    || (left.dueTime ?? "").localeCompare(right.dueTime ?? "")
    || left.id.localeCompare(right.id);
}

export function formatTransactionDeadlineTime(value: string | null) {
  if (!value) return null;
  const [hour, minute] = value.split(":");
  return `${Number(hour)} h ${minute}`;
}

export function addOneHourToTransactionDeadline(dueDate: string, dueTime: string) {
  const [year, month, day] = dueDate.split("-").map(Number);
  const [hour, minute] = dueTime.split(":").map(Number);
  const end = new Date(Date.UTC(year, month - 1, day, hour + 1, minute));
  return {
    date: end.toISOString().slice(0, 10),
    time: end.toISOString().slice(11, 16),
  };
}

export function currentTorontoDateTime(now = new Date()) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TRANSACTION_DEADLINE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

export function isTransactionDeadlineOverdue(
  deadline: { completed: boolean; dueDate: string; dueTime: string | null },
  now = new Date(),
) {
  if (deadline.completed) return false;
  const current = currentTorontoDateTime(now);
  if (deadline.dueDate !== current.date) return deadline.dueDate < current.date;
  return deadline.dueTime !== null && deadline.dueTime < current.time;
}
