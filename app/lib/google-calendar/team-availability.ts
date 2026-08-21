import type { CRMCalendarEvent } from "../../data/calendar-event-types";
import type { CalendarBroker } from "../../data/calendar-types";
import { calendarDateTimeISO } from "./calendar-date";

export type TeamAvailabilitySlot = {
  date: string;
  startTime: string;
  endTime: string;
  start: string;
  end: string;
};

const WORK_START_MINUTES = 8 * 60;
const WORK_END_MINUTES = 18 * 60;
const SLOT_MINUTES = 30;

function timeLabel(totalMinutes: number) {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function blocksSlot(event: CRMCalendarEvent, date: string, startMs: number, endMs: number) {
  if (!event.blocksAvailability) return false;
  if (event.allDay) return date >= event.start.slice(0, 10) && date < event.end.slice(0, 10);
  const eventStart = Date.parse(event.start);
  const eventEnd = Date.parse(event.end);
  return Number.isFinite(eventStart) && Number.isFinite(eventEnd) && eventStart < endMs && eventEnd > startMs;
}

export function calculateCommonAvailability(
  events: ReadonlyArray<CRMCalendarEvent>,
  date: string,
  brokers: ReadonlyArray<CalendarBroker>,
) {
  if (brokers.length === 0) return [];
  const selected = new Set(brokers);
  const freeHalfHours: Array<{ startMinutes: number; endMinutes: number }> = [];
  for (let startMinutes = WORK_START_MINUTES; startMinutes < WORK_END_MINUTES; startMinutes += SLOT_MINUTES) {
    const endMinutes = startMinutes + SLOT_MINUTES;
    const start = calendarDateTimeISO(date, timeLabel(startMinutes));
    const end = calendarDateTimeISO(date, timeLabel(endMinutes));
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    const everyoneFree = brokers.every((broker) => !events.some(
      (event) => selected.has(event.broker) && event.broker === broker && blocksSlot(event, date, startMs, endMs),
    ));
    if (everyoneFree) freeHalfHours.push({ startMinutes, endMinutes });
  }

  const merged: Array<{ startMinutes: number; endMinutes: number }> = [];
  for (const slot of freeHalfHours) {
    const previous = merged.at(-1);
    if (previous && previous.endMinutes === slot.startMinutes) previous.endMinutes = slot.endMinutes;
    else merged.push({ ...slot });
  }
  return merged.map((slot): TeamAvailabilitySlot => {
    const startTime = timeLabel(slot.startMinutes);
    const endTime = timeLabel(slot.endMinutes);
    return {
      date,
      startTime,
      endTime,
      start: calendarDateTimeISO(date, startTime),
      end: calendarDateTimeISO(date, endTime),
    };
  });
}
