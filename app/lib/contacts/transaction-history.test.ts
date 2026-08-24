import { describe, expect, it } from "vitest";
import type { Listing } from "../../data/listing-types";
import type { Transaction } from "../../data/transaction-types";
import {
  completedTransactionVolume,
  listingToPaDays,
  sortContactTransactions,
  transactionHistoryStatusLabel,
  transactionHistorySummary,
  transactionSourceListing,
} from "./transaction-history";

function transaction(values: Partial<Transaction> = {}): Transaction {
  return {
    id: crypto.randomUUID(), address: "1403 Rue de Normandie", centrisNumber: "12345678", type: "purchase", broker: "maxime",
    contactIds: ["contact"], price: 569_000, soldPrice: null, promiseDate: "2026-08-12", notaryDate: null,
    collaboratingBrokerName: "", saleFinalizedAt: null, purchaseFinalizedAt: null, status: "new", generalNotes: "", deadlines: [], notes: [],
    sourceListing: null, createdAt: "2026-08-01T14:00:00.000Z", updatedAt: "2026-08-01T14:00:00.000Z", ...values,
  };
}

function listing(values: Partial<Listing> = {}): Listing {
  return {
    id: "listing", civicNumber: "1403", address: "Rue de Normandie", apartment: "", city: "Deux-Montagnes", province: "QC",
    postalCode: "J7R 1A1", country: "Canada", centrisNumber: "12345678", broker: "maxime", status: "active", purpose: "sale",
    askingPrice: 599_000, monthlyRent: null, soldPrice: null, notaryDate: null, collaboratingBrokerName: "", propertyType: "residential",
    listingDate: "2026-08-01", expirationDate: null, centrisUrl: "", publicUrl: "", primaryImageUrl: "", generalNotes: "",
    ownerContactIds: [], createdAt: "2026-08-01T14:00:00.000Z", updatedAt: "2026-08-01T14:00:00.000Z", ...values,
  };
}

describe("historique immobilier du Contact", () => {
  it("trie du plus récent au plus ancien, déduplique et utilise les dates selon leur priorité", () => {
    const purchase2023 = transaction({ id: "2023", promiseDate: "2023-05-01", createdAt: "2023-04-01T12:00:00Z" });
    const sale2025 = transaction({ id: "2025", type: "sale", notaryDate: "2025-06-01", promiseDate: "2025-05-01" });
    const purchase2026 = transaction({ id: "2026", purchaseFinalizedAt: "2026-07-01T12:00:00Z", notaryDate: "2026-06-01" });
    expect(sortContactTransactions([purchase2023, purchase2026, sale2025, purchase2026]).map((item) => item.id))
      .toEqual(["2026", "2025", "2023"]);
  });

  it("calcule uniquement le volume réellement conclu", () => {
    const values = [
      transaction({ id: "purchase-completed", status: "completed", price: 500_000, purchaseFinalizedAt: "2026-08-19T14:00:00Z" }),
      transaction({ id: "purchase-active", status: "financing", price: 600_000 }),
      transaction({ id: "sale-finalized", type: "sale", soldPrice: 700_000, saleFinalizedAt: "2026-08-20T14:00:00Z" }),
      transaction({ id: "sale-cancelled", type: "sale", status: "cancelled", soldPrice: 800_000, saleFinalizedAt: "2026-08-21T14:00:00Z" }),
    ];
    expect(completedTransactionVolume(values)).toBe(1_200_000);
    expect(transactionHistorySummary(values)).toMatchObject({ dossiers: 4, purchases: 2, sales: 2, completedVolume: 1_200_000 });
    expect(transactionHistoryStatusLabel(values[3])).toBe("VENDUE ✓");
  });

  it("présente un achat terminé sans relation Listing ni délai", () => {
    const purchase = transaction({
      status: "completed",
      sourceListing: { listingId: "listing", offerId: "offer", address: "1403 Rue de Normandie" },
    });
    expect(transactionHistoryStatusLabel(purchase)).toBe("TERMINÉE ✓");
    expect(transactionSourceListing(purchase, new Map([["listing", listing()]]))).toBeNull();
  });

  it("reconnaît un achat finalisé comme conclu même si son statut administratif reste Notaire", () => {
    const purchase = transaction({ status: "notary", purchaseFinalizedAt: "2026-08-24T14:00:00Z" });
    expect(transactionHistoryStatusLabel(purchase)).toBe("ACHAT FINALISÉ ✓");
    expect(completedTransactionVolume([purchase])).toBe(569_000);
  });

  it("reconnaît une vente issue d’un vrai Listing et calcule 20 jours avant la PA", () => {
    const sourceListing = listing();
    const sale = transaction({
      type: "sale", promiseDate: "2026-08-21", soldPrice: 585_000, saleFinalizedAt: "2026-08-22T14:00:00Z",
      sourceListing: { listingId: sourceListing.id, offerId: "offer", address: "1403 Rue de Normandie" },
    });
    expect(transactionSourceListing(sale, new Map([[sourceListing.id, sourceListing]]))).toBe(sourceListing);
    expect(listingToPaDays(sourceListing.listingDate, sale.promiseDate)).toBe(20);
    expect(transactionHistoryStatusLabel(sale)).toBe("VENDUE ✓");
  });

  it("conserve une vente autonome valide sans faux Listing ni délai", () => {
    const sale = transaction({ type: "sale", sourceListing: null });
    expect(transactionSourceListing(sale, new Map([["listing", listing()]]))).toBeNull();
    expect(listingToPaDays(null, sale.promiseDate)).toBeNull();
  });

  it("conserve une Transaction annulée sans l’ajouter au volume", () => {
    const cancelled = transaction({ status: "cancelled", price: 800_000 });
    expect(transactionHistoryStatusLabel(cancelled)).toBe("ANNULÉE");
    expect(completedTransactionVolume([cancelled])).toBe(0);
  });

  it("refuse les délais invalides ou antérieurs à la mise en marché", () => {
    expect(listingToPaDays("2026-08-21", "2026-08-01")).toBeNull();
    expect(listingToPaDays("invalide", "2026-08-21")).toBeNull();
  });
});
