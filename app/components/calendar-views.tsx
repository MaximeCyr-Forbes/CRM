"use client";

import type { CSSProperties } from "react";
import { calendarEventKey, type CRMCalendarEvent } from "../data/calendar-event-types";
import { CALENDAR_EVENT_KIND_LABELS } from "../data/calendar-event-types";
import { BROKER_LABELS } from "../data/contact-types";
import {
  addCalendarDays,
  calendarMonthGrid,
  eventCalendarDate,
  eventCalendarMinutes,
  eventCalendarTime,
  startOfCalendarWeek,
} from "../lib/google-calendar/calendar-date";

const weekDayLabels = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];
const timelineHours = Array.from({ length: 15 }, (_, index) => index + 7);

function dayNumber(isoDate: string) {
  return Number(isoDate.slice(-2));
}

function dayLabel(isoDate: string, format: "short" | "long" = "short") {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "UTC",
    weekday: format,
    month: "short",
    day: "numeric",
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

function eventsForDate(events: ReadonlyArray<CRMCalendarEvent>, isoDate: string) {
  return events.filter((event) => eventCalendarDate(event) === isoDate);
}

function eventHour(event: CRMCalendarEvent) {
  return Number(eventCalendarTime(event).slice(0, 2));
}

export function CalendarEventButton({ event, compact = false, onOpen, timelineRowHeightRem }: {
  event: CRMCalendarEvent;
  compact?: boolean;
  onOpen: (event: CRMCalendarEvent) => void;
  timelineRowHeightRem?: number;
}) {
  const usesExactDuration = event.eventKind === "centris_showing" && timelineRowHeightRem && !event.allDay;
  const timelineStyle = usesExactDuration ? {
    "--calendar-event-offset": `${(eventCalendarMinutes(event) % 60) / 60 * timelineRowHeightRem}rem`,
    "--calendar-event-height": `${Math.max(30, (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000) / 60 * timelineRowHeightRem}rem`,
  } as CSSProperties : undefined;
  return (
    <button
      aria-label={`Ouvrir ${event.title}, calendrier ${BROKER_LABELS[event.broker]}`}
      className={`calendar-event calendar-event-${event.broker} calendar-kind-${event.eventKind} ${compact ? "is-compact" : ""} ${usesExactDuration ? "is-timeline-duration" : ""}`}
      onClick={() => onOpen(event)}
      style={timelineStyle}
      title={event.title}
      type="button"
    >
      <span className="calendar-event-dot" aria-hidden="true" />
      <span className="calendar-event-broker">{BROKER_LABELS[event.broker].slice(0, 1)}</span>
      {!event.allDay && <time>{eventCalendarTime(event)}</time>}
      <strong>{event.title}</strong>
      {!compact && <small>{BROKER_LABELS[event.broker]} · {CALENDAR_EVENT_KIND_LABELS[event.eventKind]}</small>}
    </button>
  );
}

export function CalendarMonthView({ date, events, today, onOpenEvent, onOpenDay }: {
  date: string;
  events: ReadonlyArray<CRMCalendarEvent>;
  today: string;
  onOpenEvent: (event: CRMCalendarEvent) => void;
  onOpenDay: (isoDate: string) => void;
}) {
  const dates = calendarMonthGrid(date);
  const currentMonth = date.slice(0, 7);
  return (
    <section className="calendar-month" aria-label="Vue mensuelle">
      <div className="calendar-month-weekdays">{weekDayLabels.map((label) => <span key={label}>{label}</span>)}</div>
      <div className="calendar-month-grid">
        {dates.map((isoDate) => {
          const dayEvents = eventsForDate(events, isoDate);
          return (
            <article className={`calendar-month-day ${isoDate.startsWith(currentMonth) ? "" : "is-outside"} ${isoDate === today ? "is-today" : ""}`} key={isoDate}>
              <button aria-label={`Ouvrir le ${dayLabel(isoDate, "long")}`} className="calendar-day-number" onClick={() => onOpenDay(isoDate)} type="button">{dayNumber(isoDate)}</button>
              <div className="calendar-day-events">
                {dayEvents.slice(0, 3).map((event) => <CalendarEventButton compact event={event} key={calendarEventKey(event)} onOpen={onOpenEvent} />)}
                {dayEvents.length > 3 && <button className="calendar-more-events" onClick={() => onOpenDay(isoDate)} type="button">+ {dayEvents.length - 3} autres</button>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function CalendarWeekView({ date, events, today, onOpenEvent, onSelectDay }: {
  date: string;
  events: ReadonlyArray<CRMCalendarEvent>;
  today: string;
  onOpenEvent: (event: CRMCalendarEvent) => void;
  onSelectDay?: (isoDate: string) => void;
}) {
  const start = startOfCalendarWeek(date);
  const dates = Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index));
  return (
    <section className="calendar-week" aria-label="Vue hebdomadaire">
      <div className="calendar-week-mobile">
        {dates.map((isoDate) => {
          const dayEvents = eventsForDate(events, isoDate);
          return <article className={isoDate === today ? "is-today" : ""} key={isoDate}><header><button onClick={() => onSelectDay?.(isoDate)} type="button"><strong>{dayLabel(isoDate, "long")}</strong><span>{dayNumber(isoDate)}</span></button></header><div>{dayEvents.length ? dayEvents.map((event) => <CalendarEventButton event={event} key={calendarEventKey(event)} onOpen={onOpenEvent} />) : <small>Aucun événement.</small>}</div></article>;
        })}
      </div>
      <div className="calendar-week-header"><span aria-hidden="true" />{dates.map((isoDate) => <button className={isoDate === today ? "is-today" : ""} key={isoDate} onClick={() => onSelectDay?.(isoDate)} type="button"><small>{dayLabel(isoDate)}</small><span>{dayNumber(isoDate)}</span></button>)}</div>
      <div className="calendar-week-all-day"><span>TOUTE LA JOURNÉE</span>{dates.map((isoDate) => <div key={isoDate}>{eventsForDate(events, isoDate).filter((event) => event.allDay).map((event) => <CalendarEventButton compact event={event} key={calendarEventKey(event)} onOpen={onOpenEvent} />)}</div>)}</div>
      <div className="calendar-week-timeline">
        {timelineHours.map((hour) => (
          <div className="calendar-week-hour" key={hour}>
            <time>{String(hour).padStart(2, "0")}:00</time>
            {dates.map((isoDate) => <div key={isoDate}>{eventsForDate(events, isoDate).filter((event) => !event.allDay && eventHour(event) === hour).map((event) => <CalendarEventButton compact event={event} key={calendarEventKey(event)} onOpen={onOpenEvent} timelineRowHeightRem={3.5} />)}</div>)}
          </div>
        ))}
      </div>
      {events.some((event) => !event.allDay && (eventHour(event) < 7 || eventHour(event) > 21)) && <div className="calendar-outside-hours"><strong>Hors de la plage 07:00–21:00</strong>{events.filter((event) => !event.allDay && (eventHour(event) < 7 || eventHour(event) > 21)).map((event) => <CalendarEventButton event={event} key={calendarEventKey(event)} onOpen={onOpenEvent} />)}</div>}
    </section>
  );
}

export function CalendarDayView({ date, events, today, onOpenEvent }: {
  date: string;
  events: ReadonlyArray<CRMCalendarEvent>;
  today: string;
  onOpenEvent: (event: CRMCalendarEvent) => void;
}) {
  const dayEvents = eventsForDate(events, date);
  const allDay = dayEvents.filter((event) => event.allDay);
  const hours = Array.from({ length: 24 }, (_, index) => index);
  return (
    <section className="calendar-day" aria-label="Vue quotidienne">
      <header className={date === today ? "is-today" : ""}><p>{dayLabel(date, "long")}</p><strong>{dayNumber(date)}</strong></header>
      <div className="calendar-day-all-day"><span>TOUTE LA JOURNÉE</span><div>{allDay.length ? allDay.map((event) => <CalendarEventButton event={event} key={calendarEventKey(event)} onOpen={onOpenEvent} />) : <small>Aucun événement.</small>}</div></div>
      <div className="calendar-day-timeline">{hours.map((hour) => <div className="calendar-day-hour" key={hour}><time>{String(hour).padStart(2, "0")}:00</time><div>{dayEvents.filter((event) => !event.allDay && eventHour(event) === hour).map((event) => <CalendarEventButton event={event} key={calendarEventKey(event)} onOpen={onOpenEvent} timelineRowHeightRem={3.8} />)}</div></div>)}</div>
    </section>
  );
}
