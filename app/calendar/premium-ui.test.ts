import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CalendarDayView, CalendarEventButton, CalendarMonthView, CalendarWeekView } from "../components/calendar-views";
import type { CRMCalendarEvent } from "../data/calendar-event-types";

const event: CRMCalendarEvent = {
  id: "synthetic", broker: "france", title: "Visite de démonstration", description: "", location: "",
  start: "2026-09-21T10:30:00-04:00", end: "2026-09-21T11:30:00-04:00", allDay: false,
  htmlLink: null, sourceCalendarId: "synthetic-calendar", sourceCalendarName: "Visites",
  eventKind: "centris_showing", crmEntityKind: null, crmEntityId: null, crmLink: null,
  blocksAvailability: true, readOnly: true, recurring: false,
};
describe("Premium calendar preserves event presentation contracts", () => {
  it("opens the original broker event with its identity intact", () => {
    const onOpen = vi.fn();
    const button = CalendarEventButton({ event, onOpen });
    button.props.onClick();
    expect(onOpen).toHaveBeenCalledWith(event);
    expect(button.props["aria-label"]).toBe("Ouvrir Visite de démonstration, calendrier France");
  });
  it.each([[3.5, "1.75rem", "3.5rem"], [3.8, "1.9rem", "3.8rem"]])("keeps Centris exact duration for %s rem rows", (height, offset, duration) => {
    const button = CalendarEventButton({ event, onOpen: vi.fn(), timelineRowHeightRem: Number(height) });
    expect(button.props.style).toEqual({ "--calendar-event-offset": offset, "--calendar-event-height": duration });
  });
  it("does not add artificial hours to all-day events", () => {
    const markup = renderToStaticMarkup(createElement(CalendarEventButton, { event: { ...event, allDay: true, start: "2026-09-21", end: "2026-09-22" }, onOpen: vi.fn() }));
    expect(markup).not.toContain("<time>");
    expect(markup).not.toContain("is-timeline-duration");
  });
  it.each(["month", "week", "day"])("retains accessible event actions in %s view", view => {
    const props = { date: "2026-09-21", today: "2026-09-21", events: [event], onOpenEvent: vi.fn() };
    const markup = renderToStaticMarkup(view === "month" ? createElement(CalendarMonthView, { ...props, onOpenDay: vi.fn() }) : view === "week" ? createElement(CalendarWeekView, { ...props, onSelectDay: vi.fn() }) : createElement(CalendarDayView, props));
    expect(markup).toContain("Ouvrir Visite de démonstration, calendrier France");
    expect(markup).toContain("calendar-kind-centris_showing");
  });
});
