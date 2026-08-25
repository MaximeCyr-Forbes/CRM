import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(resolve(process.cwd(), "app/components/listing-offers.tsx"), "utf8");
const detail = readFileSync(resolve(process.cwd(), "app/transactions/[transactionId]/page.tsx"), "utf8");
const transactionService = readFileSync(resolve(process.cwd(), "app/lib/transactions/server-service.ts"), "utf8");

describe("interface et vase communicant des offres", () => {
  it("affiche la section, le résumé, l’ajout, la modification et la suppression", () => {
    for (const label of ["OFFRES REÇUES", "+ Ajouter une offre", "Modifier l’offre", "Supprimer l’offre"]) expect(component).toContain(label);
    expect(component).toContain("listing-offer-summary");
  });

  it("montre la conversion seulement pour une Vente acceptée", () => {
    expect(component).toContain('offer.status === "accepted" && offer.purpose === "sale"');
    expect(component).toContain("CRÉER LA TRANSACTION");
    expect(component).toContain('offer.status === "accepted" && offer.purpose === "rental"');
    expect(component).toContain("OFFRE DE LOCATION ACCEPTÉE");
  });

  it("permet d’ouvrir la Transaction depuis le Listing", () => {
    expect(component).toContain("TRANSACTION CRÉÉE ✓");
    expect(component).toContain("Ouvrir la transaction →");
    expect(component).toContain("/transactions/${offers.transactionLink!.transactionId}");
  });

  it("permet d’ouvrir le Listing source depuis la Transaction", () => {
    expect(detail).toContain("LISTING SOURCE");
    expect(detail).toContain("/listings/${transaction.sourceListing!.listingId}");
    expect(detail).toContain("transaction.sourceListing &&");
  });

  it("conserve les Transactions classiques sans Listing source", () => {
    expect(transactionService).toContain("sourceListing: source ?");
    expect(transactionService).toContain(": null");
  });

  it("charge les liens de toutes les Transactions par lots paginés", () => {
    expect(transactionService).toContain('from("listing_transaction_links")');
    expect(transactionService).toContain("TRANSACTION_RELATION_BATCH_SIZE = 150");
    expect(transactionService).toContain('.in("transaction_id", batch)');
    expect(transactionService).toContain("listAllSupabaseRows<TransactionListingLinkRow>");
  });
});
