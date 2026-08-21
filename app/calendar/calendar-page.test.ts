import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("page Calendrier intégrée", () => {
  it("offre les trois vues, le rafraîchissement et la création", () => {
    const page = source("app/calendar/page.tsx");
    expect(page).toContain('"month", "week", "day"');
    expect(page).toContain("CalendarMonthView");
    expect(page).toContain("CalendarWeekView");
    expect(page).toContain("CalendarDayView");
    expect(page).toContain("Actualiser");
    expect(page).toContain("+ Nouvel événement");
  });

  it("réutilise les connexions, le polling et les actions Google sans persistance locale", () => {
    const page = source("app/calendar/page.tsx");
    expect(page).toContain("/api/google-calendar/connections");
    expect(page).toContain("startCalendarPolling");
    expect(page).toContain('method: eventId ? "PATCH" : "POST"');
    expect(page).toContain('method: "DELETE"');
    expect(page).not.toContain("supabase");
    expect(source("app/lib/google-calendar/calendar-events.ts")).toContain("15_000");
  });

  it("marque la route active et conserve l’ordre exact de navigation", () => {
    const header = source("app/components/app-header.tsx");
    expect(header).toContain('{ label: "Calendrier", href: "/calendar", match: "/calendar" }');
    expect(header).toContain("pathname.startsWith(link.match)");
  });
});
