import { describe, expect, it } from "vitest";
import type { Listing } from "../../data/listing-types";
import type { Transaction } from "../../data/transaction-types";
import {
  canReturnTransactionToMarket,
  mapReturnToMarketError,
  parseReturnToMarketRpcResult,
} from "./return-to-market";

const transactionId = "30000000-0000-4000-8000-000000000001";
const listingId = "10000000-0000-4000-8000-000000000001";
const offerId = "20000000-0000-4000-8000-000000000001";
const transaction = {
  type: "sale",
  status: "financing",
  saleFinalizedAt: null,
  sourceListing: { listingId, offerId, address: "1010 Laurier" },
} satisfies Pick<Transaction, "saleFinalizedAt" | "sourceListing" | "status" | "type">;
const listing = { id: listingId, status: "conditional" } satisfies Pick<Listing, "id" | "status">;

describe("retour sur le marché", () => {
  it("autorise uniquement une vente active réellement liée à un Listing non vendu", () => {
    expect(canReturnTransactionToMarket(transaction, listing)).toBe(true);
    expect(canReturnTransactionToMarket({ ...transaction, type: "purchase" }, listing)).toBe(false);
    expect(canReturnTransactionToMarket({ ...transaction, sourceListing: null }, listing)).toBe(false);
    expect(canReturnTransactionToMarket(transaction, null)).toBe(false);
    expect(canReturnTransactionToMarket(transaction, { ...listing, id: "10000000-0000-4000-8000-000000000002" })).toBe(false);
    expect(canReturnTransactionToMarket(transaction, { ...listing, status: "sold" })).toBe(false);
    expect(canReturnTransactionToMarket({ ...transaction, saleFinalizedAt: "2026-08-22T12:00:00Z" }, listing)).toBe(false);
    expect(canReturnTransactionToMarket({ ...transaction, status: "cancelled" }, listing)).toBe(false);
  });

  it("valide le résultat atomique retourné par Supabase", () => {
    expect(parseReturnToMarketRpcResult({ transactionId, listingId, offerId })).toEqual({ transactionId, listingId, offerId });
    expect(parseReturnToMarketRpcResult({ transactionId: "invalide", listingId, offerId })).toBeNull();
  });

  it("transforme les erreurs SQL en messages métier sûrs", () => {
    expect(mapReturnToMarketError({ message: "Cette Transaction ne provient pas d’un Listing." }))
      .toMatchObject({ code: "no_source_listing" });
    expect(mapReturnToMarketError({ message: "Un Listing vendu ne peut pas revenir sur le marché." }))
      .toMatchObject({ code: "listing_sold" });
  });
});
