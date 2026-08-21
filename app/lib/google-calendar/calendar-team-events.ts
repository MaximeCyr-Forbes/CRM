import type { CRMCalendarEvent } from "../../data/calendar-event-types";
import type { CalendarBroker } from "../../data/calendar-types";

export function selectVisibleCalendarEvents(
  events: ReadonlyArray<CRMCalendarEvent>,
  mode: "personal" | "team",
  personalBroker: CalendarBroker | undefined,
  visibleTeamBrokers: ReadonlyArray<CalendarBroker>,
) {
  return mode === "personal"
    ? events.filter((event) => event.broker === personalBroker)
    : events.filter((event) => visibleTeamBrokers.includes(event.broker));
}
