import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const name = "20260819234500_add_listing_offers_and_transaction_links.sql";
const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");
const conversion = sql.slice(sql.indexOf("create or replace function public.create_transaction_from_listing_offer"));

describe("migration des offres Listings", () => {
  it("crée les deux tables additives et les cascades de liens", () => {
    expect(sql).toContain("create table public.listing_offers");
    expect(sql).toContain("create table public.listing_transaction_links");
    expect(sql).toMatch(/listing_id uuid not null references public\.listings\(id\) on delete cascade/i);
    expect(sql).toMatch(/transaction_id uuid not null references public\.transactions\(id\) on delete cascade/i);
  });

  it("contraint purpose, montant, statuts, courtier et unicité des liens", () => {
    expect(sql).toContain("listing_offers_purpose_check");
    expect(sql).toContain("listing_offers_amount_check");
    expect(sql).toContain("listing_offers_status_check");
    expect(sql).toContain("created_by <> 'unassigned'");
    for (const constraint of ["listing_transaction_links_listing_unique", "listing_transaction_links_offer_unique", "listing_transaction_links_transaction_unique"]) expect(sql).toContain(constraint);
  });

  it("crée les trois index et le trigger updated_at demandés", () => {
    for (const index of ["listing_offers_listing_date_idx", "listing_offers_listing_status_idx", "listing_transaction_links_transaction_idx"]) expect(sql).toContain(index);
    expect(sql).toContain("listing_offers_set_updated_at");
    expect(sql).toContain("execute function public.set_updated_at()");
  });

  it("active RLS et réserve tables et RPC au service_role", () => {
    expect(sql).toContain("alter table public.listing_offers enable row level security");
    expect(sql).toContain("alter table public.listing_transaction_links enable row level security");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(/create policy/i);
  });

  it("crée, modifie et supprime les offres via des RPC atomiques et journalisées", () => {
    for (const rpc of ["create_listing_offer", "update_listing_offer", "delete_listing_offer"]) expect(sql).toContain(`function public.${rpc}`);
    for (const event of ["offer_added", "offer_updated", "offer_status_changed", "offer_deleted"]) expect(sql).toContain(`'${event}'`);
    expect(sql).toContain("Offre liée à une transaction");
  });

  it("renseigne accepted_at une seule fois et conserve la date ensuite", () => {
    expect(sql).toContain("when accepted_at is not null then accepted_at");
    expect(sql).toContain("when p_values->>'status' = 'accepted' then now()");
  });

  it("automatise active vers offer_received et une offre acceptée vers conditional", () => {
    expect(sql).toContain("v_listing.status = 'active'");
    expect(sql).toContain("then 'conditional' else 'offer_received'");
    expect(sql).toContain("v_listing.status = 'offer_received' and v_offer.status = 'accepted'");
    for (const terminal of ["sold", "rented", "expired", "withdrawn"]) expect(sql).not.toContain(`v_listing.status = '${terminal}' then`);
    expect(sql).not.toMatch(/set\s+status\s*=\s*'active'/i);
  });

  it("convertit exclusivement une offre Vente acceptée", () => {
    expect(conversion).toContain("v_listing.purpose <> 'sale' or v_offer.purpose <> 'sale'");
    expect(conversion).toContain("v_offer.status <> 'accepted'");
    expect(conversion).toContain("'sale', v_listing.broker, v_offer.amount");
    expect(conversion).toContain("v_offer.offer_date, 'pa_accepted'");
  });

  it("copie adresse, Centris, propriétaires et notes informatives sans créer d’acheteurs", () => {
    expect(conversion).toContain("v_listing.centris_number");
    expect(conversion).toContain("insert into public.transaction_contacts");
    expect(conversion).toContain("from public.listing_contacts");
    expect(conversion).toContain("Acheteurs :");
    expect(conversion).not.toMatch(/insert into public\.contacts/i);
  });

  it("protège la double création et journalise transaction_created", () => {
    expect(conversion).toContain("if found then return v_existing");
    expect(conversion).toContain("Ce Listing possède déjà une transaction");
    expect(conversion).toContain("'transaction_created'");
  });

  it("ne supprime ni Contact ni Transaction existante", () => {
    expect(sql).not.toMatch(/delete\s+from\s+public\.(contacts|transactions)/i);
    expect(sql).not.toMatch(/truncate(?:\s+table)?\s+public\.(contacts|transactions)/i);
    expect(sql).not.toMatch(/drop\s+table(?:\s+if\s+exists)?\s+public\.(contacts|transactions)/i);
  });

  it("fait cascader seulement la ligne de lien lors de la suppression d’une Transaction", () => {
    expect(sql).toMatch(/transaction_id uuid not null references public\.transactions\(id\) on delete cascade/i);
    expect(sql).not.toMatch(/alter table public\.transactions[\s\S]*references public\.listings/i);
  });
});
