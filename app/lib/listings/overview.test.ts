import { describe, expect, it, vi } from "vitest";
import type { Listing } from "../../data/listing-types";
import {
  calculateListingOverview,
  createListingOverviewService,
  formatListingExpirationCountdown,
  getListingDaysOnMarket,
  getListingExpirationInfo,
  loadOverviewRowsInBatches,
  type ListingOverviewRepository,
} from "./overview";

const today = new Date(2026, 7, 19);
let sequence = 0;
function listing(values: Partial<Listing> = {}): Listing {
  sequence += 1;
  return {
    id: `10000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    civicNumber: "1403", address: "rue de Normandie", apartment: "", city: "Montréal",
    province: "QC", postalCode: "H1H 1H1", country: "Canada", centrisNumber: "12345678",
    broker: "maxime", status: "active", purpose: "sale", askingPrice: 799000,
    monthlyRent: null, propertyType: "residential", listingDate: "2026-08-06",
    expirationDate: "2026-09-10", centrisUrl: "", publicUrl: "", primaryImageUrl: "",
    generalNotes: "", ownerContactIds: [], createdAt: "2026-08-01T12:00:00Z",
    updatedAt: "2026-08-19T12:00:00Z", ...values,
  };
}

describe("calculs du tableau de bord Listings", () => {
  it("compte seulement les Listings actifs", () => {
    const data = calculateListingOverview([listing(), listing({ status: "conditional" }), listing({ status: "sold" })], [], [], today);
    expect(data.activeListings).toBe(1);
  });

  it("additionne les prix de Vente en marché seulement", () => {
    const data = calculateListingOverview([
      listing({ askingPrice: 799000, status: "active" }),
      listing({ askingPrice: 700000, status: "preparation" }),
      listing({ askingPrice: null, status: "coming_soon" }),
      listing({ askingPrice: 600000, status: "sold" }),
    ], [], [], today);
    expect(data.activeSaleInventoryValue).toBe(1499000);
  });

  it("additionne séparément les loyers mensuels en marché", () => {
    const data = calculateListingOverview([
      listing({ purpose: "rental", askingPrice: null, monthlyRent: 2450 }),
      listing({ purpose: "rental", askingPrice: null, monthlyRent: 2200, status: "offer_received" }),
      listing({ purpose: "sale", askingPrice: 900000, monthlyRent: null }),
    ], [], [], today);
    expect(data.activeRentalMonthlyTotal).toBe(4650);
    expect(data.activeSaleInventoryValue).toBe(900000);
  });

  it("compte uniquement les offres reçues, en négociation ou contre-offres", () => {
    const current = listing();
    const statuses = ["received", "negotiating", "countered", "accepted", "rejected", "withdrawn", "expired"];
    const data = calculateListingOverview([current], statuses.map((status) => ({ listing_id: current.id, status })), [], today);
    expect(data.openOffers).toBe(3);
  });

  it("trie les expirations de la plus proche à la plus éloignée", () => {
    const data = calculateListingOverview([
      listing({ expirationDate: "2026-09-10" }), listing({ expirationDate: "2026-08-22" }), listing({ expirationDate: "2026-08-30" }),
    ], [], [], today);
    expect(data.expiringListings.map((item) => item.daysUntilExpiration)).toEqual([3, 11, 22]);
  });

  it.each([
    ["2026-08-25", "urgent", 6],
    ["2026-08-30", "watch", 11],
    ["2026-09-10", "upcoming", 22],
    ["2026-08-17", "overdue", -2],
  ] as const)("classe %s au niveau %s", (expirationDate, level, days) => {
    expect(getListingExpirationInfo(listing({ expirationDate }), today)).toEqual({ days, level, label: formatListingExpirationCountdown(days) });
  });

  it("affiche correctement aujourd’hui et une échéance dépassée", () => {
    expect(formatListingExpirationCountdown(0)).toBe("Expire aujourd’hui");
    expect(formatListingExpirationCountdown(-2)).toBe("Échéance dépassée de 2 jours");
  });

  it("ignore les expirations des mandats terminés", () => {
    for (const status of ["sold", "rented", "expired", "withdrawn"] as const) expect(getListingExpirationInfo(listing({ status, expirationDate: "2026-08-20" }), today)).toBeNull();
  });

  it("calcule Jour 1 et les jours sur le marché", () => {
    expect(getListingDaysOnMarket(listing({ listingDate: "2026-08-19" }), today)).toBe(1);
    expect(getListingDaysOnMarket(listing({ listingDate: "2026-08-06" }), today)).toBe(14);
    expect(getListingDaysOnMarket(listing({ listingDate: null }), today)).toBeNull();
  });

  it("calcule la moyenne seulement sur active, offer_received et conditional avec date", () => {
    const data = calculateListingOverview([
      listing({ listingDate: "2026-08-19", status: "active" }),
      listing({ listingDate: "2026-08-10", status: "offer_received" }),
      listing({ listingDate: "2026-08-01", status: "conditional" }),
      listing({ listingDate: "2026-01-01", status: "sold" }),
      listing({ listingDate: null, status: "active" }),
    ], [], [], today);
    expect(data.averageDaysOnMarket).toBe(10);
  });

  it("produit les priorités expiration, négociation, conditionnel, ancienneté et checklist", () => {
    const current = listing({ listingDate: "2026-06-01", expirationDate: "2026-08-25", status: "conditional" });
    const data = calculateListingOverview([current], [{ listing_id: current.id, status: "negotiating" }], [{ listing_id: current.id, completed: true }, { listing_id: current.id, completed: false }], today);
    expect(data.attentionItems.map((item) => item.kind)).toEqual(expect.arrayContaining(["expiration", "open_offer", "conditional", "incomplete_checklist"]));
  });
});

describe("filtres et performance de l’overview", () => {
  it.each(["france", "maxime", "sandrine"] as const)("transmet le filtre courtier %s au dépôt", async (broker) => {
    const loadListings = vi.fn(async () => []);
    const repository: ListingOverviewRepository = { loadListings, loadOpenOffers: async () => [], loadTasks: async () => [] };
    await createListingOverviewService(repository)({ broker }, today);
    expect(loadListings).toHaveBeenCalledWith({ broker });
  });

  it.each(["sale", "rental"] as const)("transmet le filtre de marché %s", async (purpose) => {
    const loadListings = vi.fn(async () => []);
    await createListingOverviewService({ loadListings, loadOpenOffers: async () => [], loadTasks: async () => [] })({ purpose }, today);
    expect(loadListings).toHaveBeenCalledWith({ purpose });
  });

  it("charge 100 Listings en un seul lot et 301 en trois lots", async () => {
    const loader = vi.fn(async (ids: ReadonlyArray<string>) => [...ids]);
    expect(await loadOverviewRowsInBatches(Array.from({ length: 100 }, (_, index) => String(index)), loader)).toHaveLength(100);
    expect(loader).toHaveBeenCalledTimes(1);
    loader.mockClear();
    expect(await loadOverviewRowsInBatches(Array.from({ length: 301 }, (_, index) => String(index)), loader)).toHaveLength(301);
    expect(loader).toHaveBeenCalledTimes(3);
    expect(loader.mock.calls.every(([ids]) => ids.length <= 150)).toBe(true);
  });
});
