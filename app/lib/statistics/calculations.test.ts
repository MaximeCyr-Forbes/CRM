import { describe, expect, it } from "vitest";
import type {
  StatisticsContactRow,
  StatisticsDataset,
  StatisticsListingRow,
  StatisticsOfferRow,
  StatisticsTransactionRow,
} from "../../data/statistics-types";
import {
  STATISTICS_YEARS,
  defaultStatisticsYear,
} from "../../data/statistics-types";
import {
  calculateStatistics,
  median,
  quebecDateKey,
  resolveStatisticsRange,
} from "./calculations";

const today = "2026-08-24";

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
    notaryDate: "2026-08-22",
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
  const range = resolveStatisticsRange({ period: "month", year: 2026, now: today })!;
  return calculateStatistics(dataset, range, broker, today, 2026);
}

describe("calculs Statistiques", () => {
  it("expose exactement les années 2020 à 2030 et choisit le fallback le plus proche", () => {
    expect(STATISTICS_YEARS).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]);
    expect(defaultStatisticsYear(new Date("2026-08-24T12:00:00-04:00"))).toBe(2026);
    expect(defaultStatisticsYear(new Date("2018-08-24T12:00:00-04:00"))).toBe(2020);
    expect(defaultStatisticsYear(new Date("2034-08-24T12:00:00-04:00"))).toBe(2030);
  });

  it("résout sérieusement les périodes historiques dans l’année sélectionnée", () => {
    expect(resolveStatisticsRange({ period: "year", year: 2024, now: today })).toMatchObject({ from: "2024-01-01", to: "2024-12-31", label: "2024" });
    expect(resolveStatisticsRange({ period: "month", year: 2023, now: today })).toMatchObject({ from: "2023-08-01", to: "2023-08-31", label: "AOÛT 2023" });
    expect(resolveStatisticsRange({ period: "three_months", year: 2024, now: today })).toMatchObject({ from: "2024-06-01", to: "2024-08-31" });
    expect(resolveStatisticsRange({ period: "month", year: 2026, now: today })).toMatchObject({ from: "2026-08-01", to: today });
    expect(resolveStatisticsRange({ period: "twelve_months", year: 2026, now: today })).toMatchObject({ from: "2025-09-01", to: today });
    expect(resolveStatisticsRange({ period: "twelve_months", year: 2024, now: today })).toBeNull();
    expect(resolveStatisticsRange({ period: "three_months", year: 2024, now: "2026-02-24" }))
      .toMatchObject({ from: "2024-01-01", to: "2024-02-29" });
  });

  it("borne strictement la période personnalisée à l’année sélectionnée", () => {
    expect(resolveStatisticsRange({ period: "custom", year: 2025, now: today, from: "2025-03-01", to: "2025-07-31" }))
      .toMatchObject({ from: "2025-03-01", to: "2025-07-31" });
    expect(resolveStatisticsRange({ period: "custom", year: 2025, now: today, from: "2024-12-01", to: "2025-07-31" })).toBeNull();
    expect(resolveStatisticsRange({ period: "custom", year: 2025, now: today, from: "2025-07-31", to: "2026-01-01" })).toBeNull();
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

  it("sépare la cohorte Listing 2023 du volume de vente finalisé en 2024", () => {
    const cohortRange = resolveStatisticsRange({ period: "year", year: 2023, now: today })!;
    const currentListing = listing({ id: "cohort-2023", listingDate: "2023-12-20", status: "sold" });
    const currentOffer = offer(currentListing.id, { id: "offer-2024", offerDate: "2024-01-05" });
    const finalizedSale = transaction({
      id: "sale-2024",
      promiseDate: "2024-01-05",
      notaryDate: "2024-02-01",
      saleFinalizedAt: "2024-02-01T15:00:00.000Z",
    });
    const result = calculateStatistics(data({
      listings: [currentListing],
      offers: [currentOffer],
      transactions: [finalizedSale],
      listingTransactionLinks: [{ listingId: currentListing.id, offerId: currentOffer.id, transactionId: finalizedSale.id }],
    }), cohortRange, "team", today, 2023);
    expect(result.listingPerformance).toMatchObject({
      listingsTaken: 1,
      listingsWithAcceptedPa: 1,
      listingsSold: 1,
      averagePaDays: 16,
      averageSaleDays: 43,
    });
    expect(result.kpis.saleTransactions).toBe(0);
    expect(result.kpis.saleVolume).toBe(0);
    expect(result.kpis.activeListings).toBeNull();
  });

  it("attribue achats et ventes à l’année réelle de finalisation avec priorité au notaire", () => {
    const range2024 = resolveStatisticsRange({ period: "year", year: 2024, now: today })!;
    const range2023 = resolveStatisticsRange({ period: "year", year: 2023, now: today })!;
    const purchase = transaction({
      id: "purchase-2024",
      type: "purchase",
      price: 600_000,
      soldPrice: null,
      notaryDate: "2024-05-15",
      saleFinalizedAt: null,
      purchaseFinalizedAt: "2024-05-16T14:00:00.000Z",
      status: "notary",
    });
    const sale = transaction({
      id: "sale-notary-2024",
      soldPrice: 725_000,
      notaryDate: "2024-06-10",
      saleFinalizedAt: "2023-12-31T15:00:00.000Z",
    });
    const dataset = data({ transactions: [purchase, sale] });
    const result2024 = calculateStatistics(dataset, range2024, "team", today, 2024);
    const result2023 = calculateStatistics(dataset, range2023, "team", today, 2023);
    expect(result2024.kpis).toMatchObject({
      purchaseTransactions: 1,
      purchaseVolume: 600_000,
      saleTransactions: 1,
      saleVolume: 725_000,
    });
    expect(result2023.kpis).toMatchObject({ purchaseTransactions: 0, purchaseVolume: 0, saleTransactions: 0, saleVolume: 0 });
  });

  it("utilise le marqueur de finalisation comme fallback si le notaire est absent", () => {
    const range2024 = resolveStatisticsRange({ period: "year", year: 2024, now: today })!;
    const purchase = transaction({
      type: "purchase",
      price: 500_000,
      soldPrice: null,
      notaryDate: null,
      saleFinalizedAt: null,
      purchaseFinalizedAt: "2024-03-10T15:00:00.000Z",
      status: "notary",
    });
    const result = calculateStatistics(data({ transactions: [purchase] }), range2024, "team", today, 2024);
    expect(result.kpis).toMatchObject({ purchaseTransactions: 1, purchaseVolume: 500_000 });
  });

  it("conserve les 12 mois vides dans les tendances annuelles", () => {
    const range = resolveStatisticsRange({ period: "year", year: 2024, now: today })!;
    const result = calculateStatistics(data(), range, "team", today, 2024);
    expect(result.trends).toHaveLength(12);
    expect(result.trends.map((item) => item.month)).toEqual([
      "2024-01", "2024-02", "2024-03", "2024-04", "2024-05", "2024-06",
      "2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12",
    ]);
    expect(result.monthContext).toMatchObject({ title: "AOÛT 2024", comparisonLabel: "août 2023" });
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

  it("conserve la conversion future dans la cohorte de provenance du Contact", () => {
    const range2023 = resolveStatisticsRange({ period: "year", year: 2023, now: today })!;
    const referred = contact({ id: "lead-2023", clientProvenance: "referral", createdAt: "2023-04-10T14:00:00.000Z" });
    const laterSale = transaction({ id: "sale-2024", notaryDate: "2024-03-15", saleFinalizedAt: "2024-03-15T14:00:00.000Z" });
    const result = calculateStatistics(data({
      contacts: [referred],
      transactions: [laterSale],
      transactionContacts: [{ contactId: referred.id, transactionId: laterSale.id }],
    }), range2023, "team", today, 2023);
    expect(result.provenance.find((item) => item.key === "referral"))
      .toMatchObject({ contacts: 1, contactsWithTransaction: 1, conversionRate: 100 });
    expect(result.kpis.saleTransactions).toBe(0);
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
