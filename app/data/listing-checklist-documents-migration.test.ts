import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260824173000_update_listing_checklist_documents.sql";
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");
const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");

const commonKeys = ["owner_deed", "owner_location_certificate", "owner_land_registry", "owner_mortgage_statement"];
const condoKeys = [
  "condo_indivision_agreement", "condo_insurance", "condo_preemption_waiver", "condo_declaration",
  "condo_insurance_policy", "condo_annual_general_meeting", "condo_minutes", "condo_financial_statements",
  "condo_budgets", "condo_reference_unit_description",
];
const landKeys = ["land_survey_certificate", "land_ccg_recommended", "land_zoning_grid"];

describe("migration des documents de checklist Listings", () => {
  it("est transactionnelle, additive et ne supprime aucune tâche historique", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/delete\s+from\s+public\.listing_marketing_tasks/i);
    expect(migration).not.toMatch(/truncate(?:\s+table)?\s+public\.listing_marketing_tasks/i);
    expect(migration).not.toMatch(/drop\s+table(?:\s+if\s+exists)?\s+public\.listing_marketing_tasks/i);
    expect(migration).not.toMatch(/set\s+completed\s*=/i);
  });

  it("renomme seulement le parent Documents et Drone sans retirer les anciennes descriptions", () => {
    expect(migration).toContain("set title = 'DOCUMENTS DU PROPRIÉTAIRE'");
    expect(migration).toContain("where task_key = 'documents'");
    expect(migration).toContain("set title = 'DRONE'");
    expect(migration).toContain("where task_key = 'video_drone'");
    expect(migration).not.toMatch(/delete[\s\S]*description_(?:fr|en)/i);
  });

  it("backfill les documents communs, copropriété et terrain sans doublon", () => {
    for (const key of [...commonKeys, ...condoKeys, ...landKeys]) {
      expect(migration).toContain(`'${key}'`);
      expect(schema).toContain(`'${key}'`);
    }
    expect(migration).toContain("listing.property_type = 'condo'");
    expect(migration).toContain("listing.property_type = 'land'");
    expect(migration.match(/on conflict \(listing_id, task_key\) where task_key is not null do nothing/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("crée et synchronise les tâches conditionnelles dans les deux RPC sans descriptions historiques", () => {
    const createStart = migration.indexOf("create or replace function public.create_listing_with_owners");
    const updateStart = migration.indexOf("create or replace function public.update_listing_with_owners");
    const createRpc = migration.slice(createStart, updateStart);
    const updateRpc = migration.slice(updateStart);
    for (const rpc of [createRpc, updateRpc]) {
      expect(rpc).toContain("DOCUMENTS DU PROPRIÉTAIRE");
      expect(rpc).toContain("task.property_requirement = v_listing.property_type");
      expect(rpc).not.toContain("description_fr");
      expect(rpc).not.toContain("description_en");
    }
    expect(updateRpc).toContain("on conflict (listing_id, task_key) where task_key is not null do nothing");
  });

  it("préserve propriétaires, historique de prix et journal d’activité des RPC", () => {
    for (const fragment of [
      "insert into public.listing_contacts", "delete from public.listing_contacts", "insert into public.listing_price_history",
      "insert into public.listing_activity", "listing_created", "purpose_changed", "status_changed", "broker_changed",
      "note_updated", "price_changed", "rent_changed", "actorBroker",
    ]) expect(migration).toContain(fragment);
  });

  it("ne touche ni aux Listings, Contacts, Transactions, Google Agenda ou autres données métier", () => {
    expect(migration).not.toMatch(/delete\s+from\s+public\.(?:listings|contacts|transactions)/i);
    expect(migration).not.toMatch(/truncate(?:\s+table)?\s+public\.(?:listings|contacts|transactions)/i);
    expect(migration).not.toMatch(/google.*calendar/i);
  });
});
