import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseListingSaleCompletion } from "./persistence";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("finalisation des ventes Listings", () => {
  it("normalise le courtier collaborateur et accepte son absence explicite", () => {
    expect(parseListingSaleCompletion({
      soldPrice: 550000,
      notaryDate: "2026-09-15",
      collaboratingBrokerName: "  Jean Tremblay  ",
      noCollaboratingBroker: false,
    })).toEqual({
      soldPrice: 550000,
      notaryDate: "2026-09-15",
      collaboratingBrokerName: "Jean Tremblay",
      noCollaboratingBroker: false,
    });
    expect(parseListingSaleCompletion({
      soldPrice: 550000,
      notaryDate: "2030-01-15",
      collaboratingBrokerName: "",
      noCollaboratingBroker: true,
    })?.collaboratingBrokerName).toBe("");
  });

  it("refuse les prix non positifs, les dates invalides et le collaborateur non confirmé", () => {
    const valid = {
      soldPrice: 550000,
      notaryDate: "2026-09-15",
      collaboratingBrokerName: "Jean Tremblay",
      noCollaboratingBroker: false,
    };
    expect(parseListingSaleCompletion({ ...valid, soldPrice: 0 })).toBeNull();
    expect(parseListingSaleCompletion({ ...valid, soldPrice: -1 })).toBeNull();
    expect(parseListingSaleCompletion({ ...valid, soldPrice: Number.NaN })).toBeNull();
    expect(parseListingSaleCompletion({ ...valid, notaryDate: "2026-02-30" })).toBeNull();
    expect(parseListingSaleCompletion({ ...valid, collaboratingBrokerName: "" })).toBeNull();
  });

  it("définit une migration additive, atomique, protégée et sans suppression de données", () => {
    const sql = source("supabase/migrations/20260821110000_add_listing_sale_completion.sql");
    expect(sql.trimStart().startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toContain("add column if not exists sold_price numeric(14, 2)");
    expect(sql).toContain("add column if not exists notary_date date");
    expect(sql).toContain("add column if not exists collaborating_broker_name text not null default ''");
    expect(sql).toContain("listings_sold_price_check");
    expect(sql).toContain("v_listings_before");
    expect(sql).toContain("v_listings_after");
    expect(sql).toContain("for update");
    expect(sql).toContain("complete_listing_sale");
    expect(sql).toContain("'sale_completed'");
    expect(sql).toContain("'status_changed'");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(/delete\s+from\s+public\.listings/i);
    expect(sql).not.toMatch(/truncate\s+(?:table\s+)?public\.listings/i);
  });
});
