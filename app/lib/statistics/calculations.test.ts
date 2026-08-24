import { describe, expect, it } from "vitest";
import type {
  StatisticsContactRow,
  StatisticsDataset,
  StatisticsListingRow,
  StatisticsOfferRow,
  StatisticsTransactionRow,
} from "../../data/statistics-types";
import {
  calculateStatistics,
  median,
  quebecDateKey,
  resolveStatisticsPeriod,
} from "./calculations";

const today = "2026-08-23";

function contact(values: Partial<StatisticsContactRow> = {}): StatisticsContactRow {
  return {
    id: crypto.randomUUID(),
    broker: "maxime",
    priority: null,
    clientProvenance: null,
    lastContactDate: null,
    nextFollowUpDate: null,
    createdAt: "2026-08-05T14:00:00.000Z",
    ...values,
  };
}

function listing(values: Partial<StatisticsListingRow> = {}): StatisticsListingRow {
  return {
    id: crypto.randomUUID(),
    broker: "maxime",
    purpose: "sale",
    status: "active",
    listingDate: "2026-08-01",
    createdAt: "2026-08-01T14:00:00.000Z",
    ...values,
  };
}

function offer(listingId: string, values: Partial<StatisticsOfferRow> = {}): StatisticsOfferRow {
  return {
    id: crypto.randomUUID(),
    listingId,
    purpose: "sale",
    offerDate: "2026-08-21",
    status: "accepted",
    ...values,
  };
}

function transaction(values: Partial<StatisticsTransactionRow> = {}): StatisticsTransactionRow {
  return {
    id: crypto.randomUUID(),
    type: "sale",
    broker: "maxime",
    price: 700_000,
    soldPrice: 690_000,
    promiseDate: "2026-08-21",
    notaryDate: "2026-09-15",
    saleFinalizedAt: "2026-08-22T14:00:00.000Z",
    purchaseFinalizedAt: null,
    status: "completed",
    createdAt: "2026-08-21T14:00:00.000Z",
    ...values,
  };
}

function data(values: Partial<StatisticsDataset> = {}): StatisticsDataset {
  return {
    contacts: [],
    listings: [],
    offers: [],
    listingTransactionLinks: [],
    transactions: [],
    transactionContacts: [],
    ...values,
  };
}

function snapshot(dataset: StatisticsDataset, broker: "team" | "maxime" | "france" | "sandrine" = "team") {
  const range = resolveStatisticsPeriod("month", today)!;
  return calculateStatistics(dataset, range, broker, today);
}

describe("calculs Statistiques", () => {
  it("calcule les périodes et valide une période personnalisée", () => {
    expect(resolveStatisticsPeriod("month", today)).toMatchObject({ from: "2026-08-01", to: today });
    expect(resolveStatisticsPeriod("three_months", today)).toMatchObject({ from: "2026-06-01", to: today });
    expect(resolveStatisticsPeriod("year", today)).toMatchObject({ from: "2026-01-01", to: today });
    expect(resolveStatisticsPeriod("twelve_months", today)).toMatchObject({ from: "2025-09-01", to: today });
    expect(resolveStatisticsPeriod("custom", today, "2026-07-01", "2026-08-10")).toMatchObject({ from: "2026-07-01", to: "2026-08-10" });
    expect(resolveStatisticsPeriod("custom", today, "2026-09-01", "2026-08-01")).toBeNull();
  });

  it("respecte les frontières de date du Québec", () => {
    expect(quebecDateKey("2026-08-01T02:30:00.000Z")).toBe("2026-07-31");
    expect(quebecDateKey("2026-08-01T05:00:00.000Z")).toBe("2026-08-01");
  });

  it("calcule 20 jours du Listing à la PA liée", () => {
    const currentListing = listing({ id: "listing-a" });
    const currentOffer = offer(currentListing.id, { id: "offer-a" });
    const currentTransaction = transaction({ id: "transaction-a", saleFinalizedAt: null, soldPrice: null, status: "pa_accepted" });
    const result = snapshot(data({
      listings: [currentListing],
      offers: [currentOffer],
      transactions: [currentTransaction],
      listingTransactionLinks: [{ listingId: currentListing.id, offerId: currentOffer.id, transactionId: currentTransaction.id }],
    }));
    expect(result.listingPerformance).toMatchObject({ listingsTaken: 1, listingsWithAcceptedPa: 1, averagePaDays: 20, medianPaDays: 20 });
  });

  it("compte un achat par son marqueur final sans jamais l’inclure dans les performances Listings", () => {
    const purchase = transaction({ id: "purchase", type: "purchase", price: 800_000, soldPrice: null, saleFinalizedAt: null, purchaseFinalizedAt: "2026-08-22T14:00:00.000Z", promiseDate: "2026-08-21", notaryDate: "2026-08-22", status: "notary" });
    const fakeListing = listing({ id: "listing-purchase" });
    const fakeOffer = offer(fakeListing.id, { id: "offer-purchase" });
    const result = snapshot(data({
      listings: [fakeListing],
      offers: [fakeOffer],
      transactions: [purchase],
      listingTransactionLinks: [{ listingId: fakeListing.id, offerId: fakeOffer.id, transactionId: purchase.id }],
    }));
    expect(result.kpis.purchaseTransactions).toBe(1);
    expect(result.kpis.purchaseVolume).toBe(800_000);
    expect(result.listingPerformance.listingsWithAcceptedPa).toBe(0);
    expect(result.listingPerformance.listingsSold).toBe(0);
    expect(result.listingPerformance.averagePaDays).toBeNull();
    expect(result.listingPerformance.averageSaleDays).toBeNull();
  });

  it("ne compte plus un ancien achat completed sans purchaseFinalizedAt", () => {
    const legacyPurchase = transaction({
      type: "purchase",
      price: 625_000,
      soldPrice: null,
      saleFinalizedAt: null,
      purchaseFinalizedAt: null,
      notaryDate: "2026-08-20",
      status: "completed",
    });
    const result = snapshot(data({ transactions: [legacyPurchase] }));
    expect(result.kpis.purchaseTransactions).toBe(0);
    expect(result.kpis.purchaseVolume).toBe(0);
  });

  it("compte une vente autonome dans le volume général mais jamais dans la performance Listing", () => {
    const autonomousSale = transaction({ soldPrice: 650_000 });
    const result = snapshot(data({ transactions: [autonomousSale] }));
    expect(result.kpis.saleTransactions).toBe(1);
    expect(result.kpis.saleVolume).toBe(650_000);
    expect(result.listingPerformance.listingsTaken).toBe(0);
    expect(result.listingPerformance.averageSaleDays).toBeNull();
  });

  it("inclut une vente liée dans le volume et le délai de vente finalisée", () => {
    const currentListing = listing({ id: "listing-sale", status: "sold" });
    const currentOffer = offer(currentListing.id, { id: "offer-sale" });
    const linkedSale = transaction({ id: "linked-sale", saleFinalizedAt: "2026-08-22T14:00:00.000Z" });
    const result = snapshot(data({
      listings: [currentListing],
      offers: [currentOffer],
      transactions: [linkedSale],
      listingTransactionLinks: [{ listingId: currentListing.id, offerId: currentOffer.id, transactionId: linkedSale.id }],
    }));
    expect(result.kpis.saleTransactions).toBe(1);
    expect(result.listingPerformance).toMatchObject({ listingsSold: 1, averagePaDays: 20, averageSaleDays: 21 });
  });

  it("exclut les locations et applique le courtier du Listing à la performance", () => {
    const maximeListing = listing({ id: "maxime" });
    const franceListing = listing({ id: "france", broker: "france" });
    const rental = listing({ id: "rental", purpose: "rental", status: "rented" });
    const result = snapshot(data({ listings: [maximeListing, franceListing, rental] }), "maxime");
    expect(result.listingPerformance.listingsTaken).toBe(1);
  });

  it("calcule moyenne et médiane sans laisser un extrême imposer la médiane", () => {
    expect(median([10, 20, 300])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it("calcule la provenance par contact unique malgré plusieurs Transactions", () => {
    const referred = contact({ id: "referred", clientProvenance: "referral" });
    const first = transaction({ id: "first" });
    const second = transaction({ id: "second", saleFinalizedAt: "2026-08-23T14:00:00.000Z" });
    const result = snapshot(data({
      contacts: [referred],
      transactions: [first, second],
      transactionContacts: [
        { contactId: referred.id, transactionId: first.id },
        { contactId: referred.id, transactionId: second.id },
      ],
    }));
    expect(result.provenance.find((item) => item.key === "referral")).toMatchObject({ contacts: 1, contactsWithTransaction: 1, conversionRate: 100 });
  });

  it("sépare jamais contactés, inactifs 90 jours et relances en retard", () => {
    const result = snapshot(data({ contacts: [
      contact({ id: "never", lastContactDate: null }),
      contact({ id: "stale", lastContactDate: "2026-05-01T14:00:00.000Z" }),
      contact({ id: "overdue", lastContactDate: "2026-08-20T14:00:00.000Z", nextFollowUpDate: "2026-08-22" }),
    ] }));
    expect(result.contactHealth).toMatchObject({ neverContacted: 1, inactive90Days: 1, overdueFollowUps: 1 });
  });

  it("agrège les trois courtiers pour les KPI Équipe tout en gardant les non attribués dans la santé de base", () => {
    const result = snapshot(data({ contacts: [
      contact({ id: "maxime", broker: "maxime" }),
      contact({ id: "france", broker: "france" }),
      contact({ id: "sandrine", broker: "sandrine" }),
      contact({ id: "unassigned", broker: "unassigned" }),
    ] }));
    expect(result.kpis.newContacts).toBe(3);
    expect(result.contactHealth).toMatchObject({ totalContacts: 4, unassigned: 1 });
  });

  it("ne produit jamais Infinity dans les comparaisons sans mois précédent", () => {
    const result = snapshot(data({ contacts: [contact()] }));
    expect(result.currentMonth.newContacts.changePercent).toBeNull();
    expect(result.currentMonth.newContacts.changeLabel).toBe("new");
  });
});
