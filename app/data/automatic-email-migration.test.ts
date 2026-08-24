import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationName = "20260824103000_create_automatic_email_preparation.sql";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");
const schema = readFileSync(resolve(root, "supabase/schema.sql"), "utf8");

describe("migration de préparation des courriels automatiques", () => {
  it("crée uniquement les tables de configuration et de livraison verrouillée", () => {
    expect(sql.trimStart().startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toContain("create table if not exists public.automatic_email_rules");
    expect(sql).toContain("create table if not exists public.automatic_email_deliveries");
    expect(sql).toContain("unique (rule_id, occurrence_key)");
    expect(sql).toContain("array['draft', 'ready', 'paused']");
    expect(sql).toContain("array['preview', 'queued', 'cancelled']");
    expect(sql).not.toMatch(/array\[[^\]]*'active'/i);
    expect(sql).not.toMatch(/array\[[^\]]*'(sent|failed)'/i);
  });

  it("seed exactement quatre règles en brouillon sans expéditeur silencieux", () => {
    for (const type of ["birthday", "mortgage_renewal", "purchase_anniversary", "google_review"]) expect(sql).toContain(`'${type}'`);
    expect(sql.match(/'draft', 'approval', null/g)).toHaveLength(4);
    expect(sql).toContain("on conflict (rule_type) do nothing");
  });

  it("n’ajoute aucun mécanisme d’envoi, Cron ou suppression de données", () => {
    expect(sql).not.toMatch(/cron|pg_net|http_post|messages\.send|webhook|scheduler/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.(contacts|listings|transactions)/i);
    expect(sql).not.toMatch(/truncate/i);
    expect(sql).not.toMatch(/drop\s+table/i);
  });

  it("conserve le schéma de référence aligné et exclusivement serveur", () => {
    expect(schema).toContain("create table if not exists public.automatic_email_rules");
    expect(schema).toContain("create table if not exists public.automatic_email_deliveries");
    expect(schema).toContain("revoke all on public.automatic_email_rules from public, anon, authenticated");
    expect(schema).toContain("grant select, insert, update on public.automatic_email_rules to service_role");
  });
});
