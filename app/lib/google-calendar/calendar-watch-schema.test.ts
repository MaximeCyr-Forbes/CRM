import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("fondation sécurisée des notifications Google Calendar", () => {
  it("crée uniquement la table de métadonnées sous RLS et une RPC service_role", () => {
    const migration = source("supabase/migrations/20260821190000_add_google_calendar_push_watch.sql");
    expect(migration).toContain("create table if not exists public.google_calendar_watch_channels");
    expect(migration).toContain("change_version bigint not null default 0");
    expect(migration).toContain("token_hash text not null");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.google_calendar_watch_channels from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete");
    expect(migration).toContain("grant execute on function public.notify_google_calendar_change(text, text, text)\nto service_role");
    expect(migration).not.toMatch(/event_title|description|location|access_token|refresh_token/);
  });

  it("rend le webhook public dans le proxy sans retirer la validation applicative", () => {
    const proxy = source("proxy.ts");
    const webhook = source("app/api/google-calendar/webhook/route.ts");
    expect(proxy).toContain('"/api/google-calendar/webhook"');
    expect(webhook).toContain("processGoogleCalendarWebhook(request.headers)");
    expect(webhook).not.toContain("requireApiAccess");
    expect(webhook).not.toContain("request.json");
  });

  it("arrête le watch avant la suppression de la connexion Google", () => {
    const service = source("app/lib/google-calendar/service.ts");
    const disconnect = service.slice(service.indexOf("export async function disconnectGoogleCalendar"));
    expect(disconnect.indexOf("stopGoogleCalendarWatch(broker)")).toBeLessThan(
      disconnect.indexOf('.from("google_calendar_connections")'),
    );
  });
});
