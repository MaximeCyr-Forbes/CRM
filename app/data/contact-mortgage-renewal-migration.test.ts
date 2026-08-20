import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260820153000_add_contact_mortgage_renewal.sql";
const sql = readFileSync(resolve(process.cwd(), migrationPath), "utf8");

describe("migration des renouvellements hypothécaires", () => {
  it("ajoute seulement une colonne nullable et protège le nombre de contacts", () => {
    expect(sql).toContain("add column if not exists mortgage_renewal_date date");
    expect(sql).toContain("crm_mortgage_renewal_contact_count");
    expect(sql).toContain("if v_before <> v_after then");
    expect(sql).not.toMatch(/delete\s+from\s+public\.contacts/i);
    expect(sql).not.toMatch(/truncate\s+(table\s+)?public\.contacts/i);
    expect(sql).not.toMatch(/drop\s+table\s+(if\s+exists\s+)?public\.contacts/i);
  });

  it("crée trois suivis, le trigger, les index et une RLS réservée au serveur", () => {
    expect(sql).toContain("contact_mortgage_renewal_calendar_events");
    expect(sql).toContain("array['france','maxime','sandrine']");
    expect(sql).toContain("queue_contact_mortgage_renewal_calendar_events");
    expect(sql).toContain("after insert or update of mortgage_renewal_date");
    expect(sql).toContain("contact_mortgage_renewal_events_broker_status_idx");
    expect(sql).toContain("contacts_mortgage_renewal_date_idx");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.contact_mortgage_renewal_calendar_events from public, anon, authenticated");
    expect(sql).toContain("to service_role");
  });
});
