import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { Listing, ListingStatus } from "../../data/listing-types";
import { emptyListingDraft } from "./editor";
import { getListingDisplayStatus } from "./display-status";
import { filterListings, LISTING_STATUS_FILTERS } from "./presentation";
import { calculateListingOverview } from "./overview";
import { createListingsService, mapListing } from "./server-service";
import type { ListingRepository, ListingRow } from "./persistence";
import { CentrisPropertyDetails } from "../../components/centris-property-details";

const fixture = (overrides: Partial<Listing> = {}): Listing => ({
  ...emptyListingDraft("maxime"), id: "listing-qa", status: "active", purpose: "sale",
  address: "Rue Exemple", city: "Ville Exemple", askingPrice: 500000,
  soldPrice: null, notaryDate: null, collaboratingBrokerName: "",
  listingDate: "2026-01-01", expirationDate: "2026-11-20",
  centrisListingKey: "qa-key", centrisStandardStatus: "Active", centrisMlsStatus: "Active",
  createdAt: "2026-01-01", updatedAt: "2026-01-01", ...overrides,
});
const soldSource = { centrisStandardStatus: "Closed", centrisMlsStatus: "Sold" };

describe("commercial classification, independent of CRM finalization", () => {
  it.each([
    ["active", "sale", "Active", "Active", "active", "crm"],
    ["active", "sale", "Closed", "Sold", "sold", "centris"],
    ["offer_received", "sale", "Closed", "Sold", "sold", "centris"],
    ["conditional", "sale", "Closed", "Sold", "sold", "centris"],
    ["active", "sale", "Closed", "Active", "active", "crm"],
    ["active", "sale", "Active", "Sold", "active", "crm"],
    ["active", "sale", null, null, "active", "crm"],
    ["active", "sale", "Unknown", "Sold", "active", "crm"],
    ["sold", "sale", "Active", "Active", "sold", "crm"],
    ["rented", "rental", "Closed", "Sold", "rented", "crm"],
    ["active", "rental", "Closed", "Sold", "active", "crm"],
  ] as const)("%s / %s / %s / %s", (status, purpose, standard, mls, expected, source) => {
    const listing = Object.freeze(fixture({ status, purpose, centrisStandardStatus: standard, centrisMlsStatus: mls }));
    expect(getListingDisplayStatus(listing)).toMatchObject({ status: expected, source });
    expect(listing.status).toBe(status);
    expect(listing.soldPrice).toBeNull();
    expect(listing.notaryDate).toBeNull();
  });

  it("assigns exactly one category and preserves search, broker and purpose filters", () => {
    const statuses: ListingStatus[] = ["active", "preparation", "coming_soon", "offer_received", "conditional", "sold", "rented"];
    const rows = [...statuses.map((status) => fixture({ id: status, status })), fixture({ id: "centris", ...soldSource })];
    const base = { broker: "all", purpose: "all", search: "" } as const;
    const categories = LISTING_STATUS_FILTERS.filter(f => f.key !== "all").flatMap(f => filterListings(rows, { ...base, status: f.key }));
    expect(categories).toHaveLength(rows.length);
    expect(new Set(categories.map(l => l.id)).size).toBe(rows.length);
    expect(filterListings(rows, { ...base, status: "closed" }).map(l => l.id)).toEqual(["sold", "rented", "centris"]);
    expect(filterListings(rows, { ...base, status: "active" }).map(l => l.id)).toEqual(["active"]);
    expect(filterListings(rows, { ...base, status: "all" })).toHaveLength(rows.length);
    expect(filterListings(rows, { ...base, status: "closed", broker: "france" })).toHaveLength(0);
    expect(filterListings(rows, { ...base, status: "closed", purpose: "rental" })).toHaveLength(0);
    expect(filterListings(rows, { ...base, status: "closed", search: "absent" })).toHaveLength(0);
    expect(filterListings(rows, { ...base, status: "closed", search: "exemple", broker: "maxime", purpose: "sale" })).toHaveLength(3);
  });

  it("reversibly excludes current inventory, offers, priorities and market-day averages", () => {
    const row = fixture();
    const offers = [{ listing_id: row.id, status: "negotiating" }];
    const tasks = [{ listing_id: row.id, completed: false, task_key: null, is_custom: true }];
    const overview = (l: Listing) => calculateListingOverview([l], offers, tasks, new Date("2026-11-16T12:00:00Z"));
    const before = overview(row);
    expect(before).toMatchObject({ activeListings: 1, activeSaleInventoryValue: 500000, openOffers: 1 });
    expect(overview({ ...row, ...soldSource })).toMatchObject({
      activeListings: 0, activeSaleInventoryValue: 0, openOffers: 0,
      attentionItems: [], expiringListings: [], averageDaysOnMarket: null,
    });
    expect(overview({ ...row, ...soldSource, centrisStandardStatus: "Active", centrisMlsStatus: "Active" })).toEqual(before);
    expect(overview({ ...row, status: "sold" }).activeListings).toBe(0);
    expect(overview({ ...row, purpose: "rental", monthlyRent: 2000, ...soldSource }).activeRentalMonthlyTotal).toBe(2000);
  });

  it("server filtering uses the same classification without mutating business rows", async () => {
    const row = { id: "qa", status: "active", purpose: "sale", broker: "maxime",
      centris_standard_status: "Closed", centris_mls_status: "Sold" } as ListingRow;
    const repository = { listRows: vi.fn(async () => [row]), listOwnerRows: vi.fn(async () => []) } as unknown as ListingRepository;
    const service = createListingsService(repository);
    expect(await service.listListings({ status: "active" })).toEqual([]);
    expect(await service.listListings({ status: "sold", broker: "maxime" })).toEqual([mapListing(row, [])]);
    expect(repository.listRows).toHaveBeenLastCalledWith({ broker: "maxime" });
    expect(row.status).toBe("active");
  });

  it("labels the Centris signal distinctly and never claims a rental is sold", () => {
    expect(getListingDisplayStatus(fixture(soldSource)).label).toBe("Vendu — Centris");
    expect(getListingDisplayStatus(fixture({ ...soldSource, status: "sold" })).label).toBe("Vendu");
    const html = renderToStaticMarkup(createElement(CentrisPropertyDetails, { listing: fixture(soldSource) }));
    expect(html).toContain("Vendu — Centris");
    expect(html).toContain("La finalisation du dossier CRM reste indépendante.");
    expect(renderToStaticMarkup(createElement(CentrisPropertyDetails, { listing: fixture({ ...soldSource, purpose: "rental" }) }))).not.toContain("Vendu — Centris");
  });
});
