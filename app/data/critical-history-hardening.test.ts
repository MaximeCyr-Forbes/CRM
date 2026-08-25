import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const migration = source("supabase/migrations/20260824223000_harden_finalized_real_estate_history.sql");

describe("durcissement critique de l’historique immobilier", () => {
  it("finalise une vente autonome sans exiger de Listing", () => {
    expect(migration).toContain("select link.listing_id, link.offer_id");
    expect(migration).toContain("if v_listing_id is not null then");
    expect(migration).toContain("update public.transactions");
    expect(migration).toContain("return v_transaction;");
  });

  it("verrouille et synchronise Transaction et Listing dans la même RPC", () => {
    const rpc = migration.slice(
      migration.indexOf("create or replace function public.complete_transaction_sale"),
      migration.indexOf("create or replace function public.protect_finalized_transaction_history"),
    );
    expect(rpc.match(/for update/g)).toHaveLength(2);
    expect(rpc).toContain("sale_finalized_at = now()");
    expect(rpc).toContain("sold_price = p_sold_price");
    expect(rpc).toContain("notary_date = p_notary_date");
    expect(rpc).toContain("collaborating_broker_name = v_collaborating_broker_name");
    expect(rpc).toContain("status = 'sold'");
    expect(rpc).not.toMatch(/exception\s+when/i);
  });

  it("garantit qu’une erreur Listing annule aussi la mise à jour Transaction", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration.match(/\bcommit;/gi)).toHaveLength(1);
    expect(migration).not.toContain("dblink");
    expect(migration).not.toContain("autonomous_transaction");
  });

  it("protège les mutations et suppressions à la fois dans SQL et les APIs", () => {
    expect(migration).toContain("transactions_protect_finalized_history");
    expect(migration).toContain("transaction_contacts_protect_finalized_history");
    expect(migration).toContain("listings_protect_finalized_history");
    expect(migration.match(/on delete restrict/g)).toHaveLength(3);
    expect(source("app/api/transactions/route.ts")).toContain("{ status: 409 }");
    expect(source("app/lib/listings/api-response.ts")).toContain('error.code === "finalized_history" || error.code === "linked_history"');
  });

  it("désactive l’ancien endpoint Listing et supprime le double appel navigateur", () => {
    const transactionPage = source("app/transactions/[transactionId]/page.tsx");
    const listingRoute = source("app/api/listings/[listingId]/complete-sale/route.ts");
    expect(transactionPage).toContain("await completeSale(transaction.id, values)");
    expect(transactionPage).not.toContain("markListingSold");
    expect(listingRoute).toContain("{ status: 409 }");
    expect(listingRoute).not.toContain("completeListingSale");
    expect(migration).toContain("from public, anon, authenticated, service_role");
  });

  it("ne supprime et ne tronque aucune donnée existante", () => {
    expect(migration).not.toMatch(/delete\s+from\s+public\./i);
    expect(migration).not.toMatch(/truncate\s+(?:table\s+)?public\./i);
    expect(migration).not.toMatch(/drop\s+table/i);
    expect(migration).toContain("v_transactions_before");
    expect(migration).toContain("v_listings_before");
    expect(migration).toContain("v_offers_before");
    expect(migration).toContain("v_links_before");
  });

  it("reproduit les protections dans le schéma consolidé", () => {
    const schema = source("supabase/schema.sql");
    expect(schema).toContain("protect_finalized_transaction_history");
    expect(schema).toContain("protect_finalized_transaction_contacts");
    expect(schema).toContain("protect_finalized_listing_history");
    expect(schema).toContain("foreign key (transaction_id) references public.transactions(id) on delete restrict");
    expect(schema).toContain("update public.listings");
  });
});
