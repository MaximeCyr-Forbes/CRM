import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("workflow Transaction vers retour sur le marché", () => {
  const page = source("app/transactions/[transactionId]/page.tsx");
  const modal = source("app/components/transaction-return-to-market-modal.tsx");
  const context = source("app/transactions-context.tsx");
  const route = source("app/api/transactions/[transactionId]/return-to-market/route.ts");
  const service = source("app/lib/transactions/server-service.ts");
  const migration = source("supabase/migrations/20260822133000_allow_listing_return_to_market.sql");
  const schema = source("supabase/schema.sql");
  const paAction = source("app/components/listing-pa-accepted-action.tsx");
  const offersUi = source("app/components/listing-offers.tsx");

  it("affiche une action sobre entre Modifier et VENDU et exige une vraie source Listing", () => {
    expect(page).toContain("canReturnTransactionToMarket(transaction, sourceListing)");
    expect(page).toContain("transaction-return-market-button");
    expect(page.indexOf("RETOUR SUR LE MARCHÉ")).toBeLessThan(page.indexOf(">VENDU<"));
    expect(page).toContain("sourceListing && <TransactionReturnToMarketModal");
  });

  it("confirme clairement, bloque les doubles clics et redirige vers le Listing rafraîchi", () => {
    expect(modal).toContain("RETOUR SUR LE MARCHÉ ?");
    expect(modal).toContain("La Transaction sera annulée et conservée dans l’historique.");
    expect(modal).toContain("Le Listing sera remis en marché avec le statut Actif.");
    expect(modal).toContain("CONFIRMER LE RETOUR");
    expect(modal).toContain("submittingRef.current");
    expect(page).toContain("await returnToMarket(transaction.id)");
    expect(page).toContain("await retryListings()");
    expect(page).toContain('window.sessionStorage.setItem("listingNotice", "Listing remis en marché.")');
    expect(page).toContain("router.push(`/listings/${result.listingId}`)");
  });

  it("protège la route et met à jour l’état Transaction sans exposer Supabase au navigateur", () => {
    expect(route).toContain("requireApiAccess()");
    expect(route).toContain("isSameOriginRequest(request)");
    expect(route).toContain("isTransactionUuid(transactionId)");
    expect(route).toContain("returnListingTransactionToMarket(transactionId, actorBroker)");
    expect(context).toContain("returnToMarket:");
    expect(context).toContain("replaceTransaction(payload.data.transaction)");
    expect(context).not.toContain("getSupabaseAdmin");
    expect(service).toContain('rpc("return_listing_transaction_to_market"');
  });

  it("effectue atomiquement l’annulation, la remise active et l’activité sans suppression", () => {
    for (const sql of [migration, schema]) {
      expect(sql).toContain("create or replace function public.return_listing_transaction_to_market");
      expect(sql).toContain("set status = 'cancelled'");
      expect(sql).toContain("set status = 'active'");
      expect(sql).toContain("'returned_to_market'");
      expect(sql).toContain("'Transaction annulée · propriété remise en marché'");
    }
    expect(migration).not.toMatch(/delete\s+from\s+public\.(listings|transactions|listing_offers|listing_transaction_links)/i);
  });

  it("autorise plusieurs Transactions historiques mais une seule active et protège tous les décomptes", () => {
    expect(migration).toContain("drop constraint if exists listing_transaction_links_listing_unique");
    expect(migration).toContain("create index if not exists listing_transaction_links_listing_idx");
    expect(migration).toContain("and t.status <> 'cancelled'");
    expect(migration).toContain("v_listings_after <> v_listings_before");
    expect(migration).toContain("v_transactions_after <> v_transactions_before");
    expect(migration).toContain("v_offers_after <> v_offers_before");
    expect(migration).toContain("v_links_after <> v_links_before");
    expect(migration).toContain("v_activity_after <> v_activity_before");
    expect(migration).not.toContain("drop constraint if exists listing_transaction_links_offer_unique");
    expect(migration).not.toContain("drop constraint if exists listing_transaction_links_transaction_unique");
  });

  it("réactive PA ACCEPTÉE sans proposer l’ancienne offre historiquement consommée", () => {
    expect(paAction).toContain("!offers.consumedOfferIds.includes(offer.id)");
    expect(offersUi).toContain("Liée à une transaction historique");
    expect(offersUi).toContain("!consumed && !offers.transactionLink");
  });
});
