export const GOOGLE_CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_CALENDAR_LIST_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";

export function hasGoogleCalendarListReadonlyScope(scopes: ReadonlyArray<string> | null | undefined) {
  return scopes?.includes(GOOGLE_CALENDAR_LIST_READONLY_SCOPE) ?? false;
}
