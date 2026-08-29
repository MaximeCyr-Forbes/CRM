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

  it("intègre le sélecteur de mois et d’année sans changer la vue active", () => {
    const page = source("app/calendar/page.tsx");
    const picker = source("app/components/calendar-period-picker.tsx");
    expect(page).toContain("CalendarPeriodPicker");
    expect(page).toContain("onSelect={setDate}");
    expect(page).toContain("label={periodLabel(view, date)}");
    expect(picker).toContain('role="dialog"');
    expect(picker).toContain('aria-haspopup="dialog"');
    expect(picker).toContain('event.key === "Escape"');
    expect(picker).toContain("todayInCalendarTimeZone()");
    expect(picker).toContain("calendarDateForMonth(selectedYear, month)");
    expect(picker).not.toContain("setView");
  });

  it("réutilise les connexions, le signal push et les actions Google sans persistance locale", () => {
    const page = source("app/calendar/page.tsx");
    expect(page).toContain("/api/google-calendar/connections");
    expect(page).toContain("startCalendarTeamSyncMonitors");
    expect(page).toContain("/api/calendar/change-state");
    expect(page).toContain("/api/calendar/watch/ensure");
    expect(page).toContain('method: eventId ? "PATCH" : "POST"');
    expect(page).toContain('method: "DELETE"');
    expect(page).not.toContain("supabase");
    expect(source("app/lib/google-calendar/calendar-sync-monitor.ts")).toContain("3_000");
    expect(source("app/lib/google-calendar/calendar-sync-monitor.ts")).toContain("120_000");
  });

  it("affiche les visites Centris en lecture seule avec leur source et un repli discret", () => {
    const page = source("app/calendar/page.tsx");
    const modal = source("app/components/calendar-event-detail-modal.tsx");
    const styles = source("app/globals.css");
    expect(page).toContain("centrisShowingsStatus");
    expect(page).toContain("Visites Centris temporairement indisponibles");
    expect(modal).toContain("event.sourceCalendarName");
    expect(modal).toContain("Centris Zone Showings et est affichée en lecture seule");
    expect(modal).toContain("Ouvrir dans Google Agenda");
    expect(styles).toContain(".calendar-kind-centris_showing");
    expect(styles).toContain("#e87524");
    expect(source("app/components/calendar-views.tsx")).toContain("timelineRowHeightRem={3.5}");
    expect(source("app/components/calendar-views.tsx")).toContain("timelineRowHeightRem={3.8}");
    expect(styles).toContain("--calendar-event-height");
  });

  it("présente les trois statuts Centris et l’action de réautorisation dans Paramètres", () => {
    const settings = source("app/settings/page.tsx");
    expect(settings).toContain("Visites Centris — Synchronisées ✓");
    expect(settings).toContain("Visites Centris — Autorisation requise");
    expect(settings).toContain("Visites Centris — Calendrier non détecté");
    expect(settings).toContain("AUTORISER LES VISITES CENTRIS");
  });

  it("offre le mode équipe, les filtres et les disponibilités sans FreeBusy", () => {
    const page = source("app/calendar/page.tsx");
    expect(page).toContain('type CalendarMode = "personal" | "team"');
    expect(page).toContain("Promise.allSettled");
    expect(page).toContain("visibleTeamBrokers");
    expect(page).toContain("calculateCommonAvailability");
    expect(page).toContain("DISPONIBILITÉS DE L’ÉQUIPE");
    expect(page).not.toContain("freeBusy");
  });

  it("marque la route active et conserve l’ordre exact de navigation", () => {
    const header = source("app/components/app-header.tsx");
    expect(header).toContain('{ label: "Calendrier", href: "/calendar", match: "/calendar" }');
    expect(header).toContain("pathname.startsWith(link.match)");
  });
});
