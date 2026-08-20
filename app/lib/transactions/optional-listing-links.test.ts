import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { mapTransaction, type TransactionRow } from "./server-service";
import { isOptionalListingLinksUnavailableError, optionalListingLinkRows } from "./optional-listing-links";

const transactionRow: TransactionRow = {
  id: "transaction-1",
  address: "1010 Av. Laurier E., Montréal",
  centris_number: "20701687",
  type: "sale",
  broker: "maxime",
  price: 500000,
  promise_date: null,
  status: "on_market",
  general_notes: "",
  created_at: "2026-08-20T12:00:00.000Z",
  updated_at: "2026-08-20T12:00:00.000Z",
};

describe("relation Listing facultative des transactions", () => {
  it("reconnaît les erreurs table absente et cache de schéma", () => {
    expect(isOptionalListingLinksUnavailableError({ code: "PGRST205" })).toBe(true);
    expect(isOptionalListingLinksUnavailableError({ code: "42P01" })).toBe(true);
    expect(isOptionalListingLinksUnavailableError({ message: "Could not find the table public.listing_transaction_links in the schema cache" })).toBe(true);
  });

  it("retourne les transactions normales avec sourceListing null si la relation est indisponible", () => {
    const warn = vi.fn();
    const links = optionalListingLinkRows({ data: null, error: { code: "PGRST205", message: "Table absente du schema cache" } }, warn);
    expect(mapTransaction(transactionRow, [], [], [], links as Parameters<typeof mapTransaction>[4]).sourceListing).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("conserve la source Listing lorsque la relation est disponible", () => {
    const links = optionalListingLinkRows({ data: [{
      listing_id: "listing-1",
      offer_id: "offer-1",
      transaction_id: "transaction-1",
      listings: { civic_number: "1010", address: "Av. Laurier E.", apartment: "", city: "Montréal", province: "QC", postal_code: "H2J 1G9" },
    }], error: null });
    expect(mapTransaction(transactionRow, [], [], [], links).sourceListing).toEqual({
      listingId: "listing-1",
      offerId: "offer-1",
      address: "1010 Av. Laurier E., Montréal, QC H2J 1G9",
    });
  });

  it("ne masque pas une erreur Listing inattendue", () => {
    expect(() => optionalListingLinkRows({ data: null, error: { code: "42501", message: "Permission denied" } }))
      .toThrow();
  });

  it("crée une transaction depuis la ligne insérée sans relecture Listing fragile", () => {
    const source = readFileSync(resolve(process.cwd(), "app/lib/transactions/server-service.ts"), "utf8");
    const createSource = source.slice(source.indexOf("export async function createTransaction"), source.indexOf("export async function updateTransaction"));
    expect(createSource).toContain('.insert(transactionInsertValues(draft))\n    .select("*")');
    expect(createSource).toContain("return mapTransaction(");
    expect(createSource).not.toContain("return getTransaction(transactionId);");
    expect(source).toContain("const listingLinkRows = optionalListingLinkRows(listingLinksResult);");
  });
});
