import { describe, expect, it } from "vitest";
import type { ListingStatus } from "../../data/listing-types";
import type { TransactionStatus, TransactionType } from "../../data/transaction-types";
import { canFinalizeListingSaleFromTransaction } from "./listing-sale-finalization";

function transaction(
  type: TransactionType,
  status: TransactionStatus,
  listingId: string | null = "listing-1",
) {
  return {
    type,
    status,
    sourceListing: listingId ? { listingId, offerId: "offer-1", address: "647 rue Papineau" } : null,
  };
}

function listing(status: ListingStatus = "active", id = "listing-1") {
  return { id, status };
}

describe("finalisation de vente depuis une Transaction", () => {
  it.each(["new", "on_market", "offer_received", "negotiation", "pa_accepted", "inspection", "financing", "other_conditions", "conditions_met", "notary", "completed", "cancelled"] as const)(
    "autorise une Transaction de vente au statut %s avec son Listing source actif",
    (status) => expect(canFinalizeListingSaleFromTransaction(transaction("sale", status), listing())).toBe(true),
  );

  it("refuse une Transaction d’achat", () => {
    expect(canFinalizeListingSaleFromTransaction(transaction("purchase", "completed"), listing())).toBe(false);
  });

  it("exige la relation sourceListing et le Listing réellement résolu", () => {
    expect(canFinalizeListingSaleFromTransaction(transaction("sale", "completed", null), listing())).toBe(false);
    expect(canFinalizeListingSaleFromTransaction(transaction("sale", "completed"), null)).toBe(false);
    expect(canFinalizeListingSaleFromTransaction(transaction("sale", "completed"), listing("active", "listing-2"))).toBe(false);
  });

  it("masque l’action lorsque le Listing source est déjà vendu", () => {
    expect(canFinalizeListingSaleFromTransaction(transaction("sale", "completed"), listing("sold"))).toBe(false);
  });
});
