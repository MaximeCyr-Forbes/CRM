import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("finalisation du Listing depuis la Transaction", () => {
  const transactionDetail = source("app/transactions/[transactionId]/page.tsx");
  const listingDetail = source("app/listings/[listingId]/page.tsx");
  const soldModal = source("app/components/listing-sold-modal.tsx");
  const listingsContext = source("app/listings-context.tsx");

  it("résout exclusivement le Listing relié par sourceListing", () => {
    expect(transactionDetail).toContain("useListings()");
    expect(transactionDetail).toContain("listing.id === transaction.sourceListing?.listingId");
    expect(transactionDetail).toContain("canFinalizeListingSaleFromTransaction(transaction, sourceListing)");
    expect(transactionDetail).not.toContain("find((listing) => listing.address");
  });

  it("place le bouton VENDU dans les actions de la Transaction et plus dans le Listing", () => {
    expect(transactionDetail).toContain('className="listing-sold-button"');
    expect(transactionDetail).toContain("setIsMarkingSold(true)");
    expect(listingDetail).not.toContain('className="listing-sold-button"');
    expect(listingDetail).not.toContain("ListingSoldModal");
  });

  it("réutilise la modal et la mécanique de finalisation existantes", () => {
    expect(transactionDetail).toContain("<ListingSoldModal");
    expect(transactionDetail).toContain("await markListingSold(sourceListing.id, values)");
    expect(transactionDetail).toContain("Vente finalisée. Le Listing a été déplacé dans VENDUS / LOUÉS.");
    expect(soldModal).toContain("Prix vendu *");
    expect(soldModal).toContain("Date du notaire *");
    expect(soldModal).toContain("Courtier collaborateur *");
    expect(listingsContext).toContain("return replaceListing(listing)");
  });

  it("conserve le bloc Listing source et signale la vente finalisée ou l’indisponibilité", () => {
    expect(transactionDetail).toContain("LISTING SOURCE");
    expect(transactionDetail).toContain("Ouvrir le Listing →");
    expect(transactionDetail).toContain("VENTE FINALISÉE ✓");
    expect(transactionDetail).toContain("Listing source temporairement indisponible.");
  });
});
