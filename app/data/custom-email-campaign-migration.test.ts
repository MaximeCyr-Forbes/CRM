import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260824170000_create_custom_email_campaigns.sql";
const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");
const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");

describe("migration des campagnes courriel personnalisées", () => {
  it("crée trois tables séparées sans modifier les règles prescrites", () => {
    expect(sql.trimStart().startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    for (const table of ["custom_email_campaigns", "custom_email_campaign_contacts", "custom_email_campaign_steps"]) expect(sql).toContain(`create table if not exists public.${table}`);
    expect(sql).not.toContain("alter table public.automatic_email_rules");
    expect(sql).not.toMatch(/'custom'/);
    expect(sql).not.toContain("custom_email_campaign_deliveries");
  });

  it("impose les contraintes métier, RLS et accès service_role", () => {
    expect(sql).toContain("array['draft', 'ready', 'paused']");
    expect(sql).not.toMatch(/array\[[^\]]*'active'/);
    expect(sql).toContain("array['approval', 'automatic']");
    expect(sql).toContain("array['assigned_broker', 'fixed_broker']");
    expect(sql).toContain("delay_days_after_previous between 0 and 3650");
    expect(sql).toContain("unique (campaign_id, step_order)");
    for (const table of ["custom_email_campaigns", "custom_email_campaign_contacts", "custom_email_campaign_steps"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on public.${table} from public, anon, authenticated`);
      expect(sql).toContain(`grant select, insert, update, delete on public.${table} to service_role`);
      expect(schema).toContain(`create table if not exists public.${table}`);
    }
  });

  it("ne crée aucun moteur d’envoi et ne détruit aucune donnée", () => {
    expect(sql).not.toMatch(/cron|scheduler|runner|queue|messages\.send|gmail/i);
    expect(sql).not.toMatch(/delete\s+from|truncate|drop\s+table/i);
  });
});
