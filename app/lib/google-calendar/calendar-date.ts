import type { CRMCalendarEvent } from "../../data/calendar-event-types";
import { CALENDAR_TIME_ZONE } from "./calendar-events";

export type CalendarView = "month" | "week" | "day";

export function addCalendarDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function todayInCalendarTimeZone(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function calendarDateForMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) throw new RangeError("Année de calendrier invalide.");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError("Mois de calendrier invalide.");
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

export function startOfCalendarWeek(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return addCalendarDays(isoDate, -mondayOffset);
}

export function calendarMonthGrid(isoDate: string) {
  const monthStart = `${isoDate.slice(0, 7)}-01`;
  const gridStart = startOfCalendarWeek(monthStart);
  return Array.from({ length: 42 }, (_, index) => addCalendarDays(gridStart, index));
}

export function calendarRange(view: CalendarView, isoDate: string) {
  if (view === "month") {
    const dates = calendarMonthGrid(isoDate);
    return { startDate: dates[0], endDate: addCalendarDays(dates.at(-1)!, 1) };
  }
  if (view === "week") {
    const startDate = startOfCalendarWeek(isoDate);
    return { startDate, endDate: addCalendarDays(startDate, 7) };
  }
  return { startDate: isoDate, endDate: addCalendarDays(isoDate, 1) };
}

function timezoneOffsetMilliseconds(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const zonedAsUTC = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return zonedAsUTC - date.getTime();
}

export function calendarDateTimeISO(isoDate: string, time: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const firstGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const firstOffset = timezoneOffsetMilliseconds(firstGuess);
  const secondGuess = new Date(firstGuess.getTime() - firstOffset);
  const secondOffset = timezoneOffsetMilliseconds(secondGuess);
  return new Date(firstGuess.getTime() - secondOffset).toISOString();
}

export function eventCalendarDate(event: CRMCalendarEvent) {
  if (event.allDay) return event.start.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(event.start));
}

export function eventCalendarTime(event: CRMCalendarEvent, field: "start" | "end" = "start") {
  if (event.allDay) return "";
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: CALENDAR_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(event[field]));
}

export function eventCalendarMinutes(event: CRMCalendarEvent, field: "start" | "end" = "start") {
  if (event.allDay) return 0;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(event[field]));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

export function moveCalendarDate(isoDate: string, view: CalendarView, direction: -1 | 1) {
  if (view === "day") return addCalendarDays(isoDate, direction);
  if (view === "week") return addCalendarDays(isoDate, 7 * direction);
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 10);
}
