import { describe, expect, it } from "vitest";
import { SALE_TRANSACTION_STATUSES, type TransactionType } from "../../data/transaction-types";
import {
  normalizeCentrisNumber,
  resolveListingForSaleTransaction,
  shouldShowListingSaleAction,
} from "./listing-sale-resolution";

function transaction({
  centrisNumber = "27964633",
  listingId = null,
  type = "sale",
}: {
  centrisNumber?: string;
  listingId?: string | null;
  type?: TransactionType;
} = {}) {
  return {
    centrisNumber,
    sourceListing: listingId
      ? { listingId, offerId: "offer-1", address: "7031 rang St-Etienne" }
      : null,
    type,
  };
}

function listing(
  id: string,
  centrisNumber: string,
  status: "active" | "sold" = "active",
  address = "7031 rang St-Etienne",
) {
  return { id, centrisNumber, status, address };
}

describe("action VENDU d’une Transaction", () => {
  it.each(SALE_TRANSACTION_STATUSES)(
    "reste visible pour une Transaction de vente au statut %s",
    (status) => {
      expect(shouldShowListingSaleAction({ type: "sale", status })).toBe(true);
    },
  );

  it("reste absente pour une Transaction d’achat", () => {
    expect(shouldShowListingSaleAction({ type: "purchase", status: "notary" })).toBe(false);
  });
});

describe("résolution du Listing à finaliser", () => {
  it("utilise en priorité le Listing explicitement relié", () => {
    const linked = listing("listing-linked", "11111111");
    const centrisMatch = listing("listing-centris", "27964633");

    expect(resolveListingForSaleTransaction(
      transaction({ listingId: linked.id }),
      [centrisMatch, linked],
    )).toBe(linked);
  });

  it("retrouve une ancienne Transaction par son numéro Centris exact normalisé", () => {
    const match = listing("listing-1", "27964633");

    expect(normalizeCentrisNumber(" 279 64633 ")).toBe("27964633");
    expect(resolveListingForSaleTransaction(
      transaction({ centrisNumber: "279 64633" }),
      [match],
    )).toBe(match);
  });

  it("utilise le Centris si la relation explicite est introuvable", () => {
    const match = listing("listing-centris", "27964633");

    expect(resolveListingForSaleTransaction(
      transaction({ listingId: "listing-absent" }),
      [match],
    )).toBe(match);
  });

  it("ne fait jamais de rapprochement par adresse", () => {
    const sameAddress = listing("listing-1", "99999999");

    expect(resolveListingForSaleTransaction(
      transaction({ centrisNumber: "27964633" }),
      [sameAddress],
    )).toBeNull();
  });

  it("retourne null sans relation valide ni numéro Centris", () => {
    expect(resolveListingForSaleTransaction(
      transaction({ centrisNumber: "" }),
      [listing("listing-1", "27964633")],
    )).toBeNull();
  });

  it("résout aussi un Listing déjà vendu afin de bloquer une seconde finalisation au clic", () => {
    const sold = listing("listing-1", "27964633", "sold");

    expect(resolveListingForSaleTransaction(transaction(), [sold])).toBe(sold);
  });
});
