import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("finalisation autonome de la vente dans la Transaction", () => {
  const transactionDetail = source("app/transactions/[transactionId]/page.tsx");
  const listingDetail = source("app/listings/[listingId]/page.tsx");
  const soldModal = source("app/components/sale-completion-modal.tsx");
  const listingsContext = source("app/listings-context.tsx");

  it("n’utilise le Listing explicite que comme synchronisation secondaire", () => {
    expect(transactionDetail).toContain("useListings()");
    expect(transactionDetail).toContain("listing.id === transaction.sourceListing?.listingId");
    expect(transactionDetail).not.toContain("resolveListingForSaleTransaction");
    expect(transactionDetail).not.toContain("normalizeCentrisNumber");
    expect(transactionDetail).not.toContain("find((listing) => listing.address");
  });

  it("affiche VENDU seulement pour une vente non finalisée", () => {
    expect(transactionDetail).toContain('className="listing-sold-button"');
    expect(transactionDetail).toContain("canCompleteTransactionSale(transaction)");
    expect(transactionDetail).toContain("setIsMarkingSold(true)");
    expect(listingDetail).not.toContain('className="listing-sold-button"');
    expect(listingDetail).not.toContain("SaleCompletionModal");
  });

  it("finalise d’abord la Transaction puis synchronise le Listing lié si nécessaire", () => {
    expect(transactionDetail).toContain("<SaleCompletionModal");
    expect(transactionDetail).toContain("await completeSale(transaction.id, values)");
    expect(transactionDetail).toContain("await markListingSold(sourceListing.id, values)");
    expect(transactionDetail).toContain("Vente enregistrée dans la Transaction. Le Listing lié n’a pas pu être synchronisé.");
    expect(soldModal).toContain("Prix vendu *");
    expect(soldModal).toContain("Date du notaire *");
    expect(soldModal).toContain("Courtier collaborateur *");
    expect(soldModal).toContain("FINALISER LA VENTE");
    expect(soldModal).toContain("Prix de la Transaction");
    expect(listingsContext).toContain("return replaceListing(listing)");
  });

  it("conserve le bloc Listing source et signale la vente finalisée ou l’indisponibilité", () => {
    expect(transactionDetail).toContain("LISTING SOURCE");
    expect(transactionDetail).toContain("Ouvrir le Listing →");
    expect(transactionDetail).toContain("VENTE FINALISÉE ✓");
    expect(transactionDetail).toContain("Listing source temporairement indisponible.");
  });

  it("affiche le résultat persistant sans conserver l’ancienne erreur Listing", () => {
    expect(transactionDetail).toContain("RÉSULTAT DE LA VENTE");
    expect(transactionDetail).toContain("transaction.soldPrice");
    expect(transactionDetail).toContain("transaction.notaryDate");
    expect(transactionDetail).toContain("transaction.collaboratingBrokerName");
    expect(transactionDetail).not.toContain("LISTING INTROUVABLE");
    expect(transactionDetail).not.toContain("Aucun Listing correspondant à cette Transaction n’a été trouvé.");
  });
});
