import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260819223000_add_listing_marketing_tracking.sql";
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

describe("migration du suivi Listings", () => {
  it("crée les quatre tables relationnelles avec suppression en cascade", () => {
    for (const table of ["listing_marketing_tasks", "listing_visits", "listing_activity", "listing_price_history"]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toMatch(new RegExp(`create table public\\.${table}[\\s\\S]*?references public\\.listings\\(id\\) on delete cascade`, "i"));
    }
  });

  it("crée les index, les triggers updated_at et l’unicité partielle des tâches standards", () => {
    for (const index of ["listing_marketing_tasks_listing_idx", "listing_visits_listing_date_idx", "listing_activity_listing_created_idx", "listing_price_history_listing_changed_idx"]) expect(migration).toContain(index);
    expect(migration).toContain("listing_marketing_tasks_standard_unique_idx");
    expect(migration).toContain("where task_key is not null");
    expect(migration.match(/execute function public\.set_updated_at\(\)/g)).toHaveLength(2);
  });

  it("active RLS, retire les accès publics et réserve tables et RPC au service_role", () => {
    for (const table of ["listing_marketing_tasks", "listing_visits", "listing_activity", "listing_price_history"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/create policy/i);
  });

  it("installe exactement les neuf tâches standards et les déduplique au backfill", () => {
    for (const key of ["photos", "sign", "documents", "description_fr", "description_en", "centris", "social_media", "open_house", "video_drone"]) expect(migration).toContain(`'${key}'`);
    expect(migration).toContain("on conflict (listing_id, task_key) where task_key is not null do nothing");
  });

  it("backfill prix et activité de façon idempotente", () => {
    expect(migration).toContain("Listing existant intégré au suivi");
    expect(migration).toContain("20260819223000_add_listing_marketing_tracking");
    expect(migration.match(/not exists \(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("case when listing.purpose = 'sale' then listing.asking_price else listing.monthly_rent end");
  });

  it("rend création, prix initial, checklist et activité atomiques dans la RPC existante", () => {
    const createRpc = migration.slice(migration.indexOf("create or replace function public.create_listing_with_owners"), migration.indexOf("create or replace function public.update_listing_with_owners"));
    expect(createRpc).toContain("insert into public.listings");
    expect(createRpc).toContain("insert into public.listing_contacts");
    expect(createRpc).toContain("insert into public.listing_marketing_tasks");
    expect(createRpc).toContain("insert into public.listing_price_history");
    expect(createRpc).toContain("insert into public.listing_activity");
  });

  it("journalise uniquement les changements historiques pertinents", () => {
    for (const event of ["listing_created", "status_changed", "price_changed", "rent_changed", "purpose_changed", "broker_changed", "marketing_task_completed", "marketing_task_reopened", "custom_task_added", "visit_added", "visit_updated", "visit_deleted", "note_updated"]) expect(migration).toContain(`'${event}'`);
    expect(migration).toContain("is distinct from v_listing.asking_price");
    expect(migration).toContain("is distinct from v_listing.monthly_rent");
  });

  it("ne touche jamais aux Contacts et ne crée ni offre ni calendrier", () => {
    expect(migration).not.toMatch(/delete\s+from\s+public\.contacts/i);
    expect(migration).not.toMatch(/truncate(?:\s+table)?\s+public\.contacts/i);
    expect(migration).not.toMatch(/drop\s+table(?:\s+if\s+exists)?\s+public\.contacts/i);
    expect(migration).not.toMatch(/alter\s+table\s+public\.contacts/i);
    expect(migration).not.toContain("listing_offers");
    expect(migration).not.toMatch(/google.*calendar/i);
  });
});
