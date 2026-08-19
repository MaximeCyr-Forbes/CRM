import { describe, expect, it } from "vitest";
import type { Contact } from "../../data/contact-types";
import type { Listing } from "../../data/listing-types";
import {
  LISTING_STATUS_FILTERS,
  buildContactNameMap,
  filterListings,
  listingAddressLines,
  listingBrokerFilterFromParam,
  listingMatchesSearch,
  listingOwnerNames,
  listingPriceLabel,
  listingPurposeFilterFromParam,
  listingStatusFilterFromParam,
} from "./presentation";

function listing(values: Partial<Listing> & Pick<Listing, "id">): Listing {
  return {
    civicNumber: "1403",
    address: "rue de Normandie",
    apartment: "",
    city: "Deux-Montagnes",
    province: "QC",
    postalCode: "J7R 1T1",
    country: "Canada",
    centrisNumber: "12345678",
    broker: "maxime",
    status: "active",
    purpose: "sale",
    askingPrice: 799000,
    monthlyRent: null,
    propertyType: "residential",
    listingDate: null,
    expirationDate: null,
    centrisUrl: "",
    publicUrl: "",
    primaryImageUrl: "",
    generalNotes: "",
    ownerContactIds: [],
    createdAt: "2026-08-19T20:00:00.000Z",
    updatedAt: "2026-08-19T20:00:00.000Z",
    ...values,
  };
}

function contact(id: string, firstName: string, lastName: string): Contact {
  return {
    id,
    firstName,
    lastName,
    phone: "",
    email: "",
    birthDate: "",
    civicNumber: "",
    address: "",
    apartment: "",
    city: "",
    province: "",
    postalCode: "",
    country: "",
    broker: "maxime",
    clientType: null,
    priority: null,
    status: "active",
    source: "manual",
    lastContactDate: null,
    nextFollowUpDate: null,
    googleCalendarEventId: null,
    googleCalendarEventBroker: null,
    googleCalendarSyncStatus: "synced",
    googleCalendarLastError: null,
    addresses: [],
    createdAt: "2026-08-19T20:00:00.000Z",
    updatedAt: "2026-08-19T20:00:00.000Z",
  };
}

const inventory = [
  listing({ id: "maxime-active-sale" }),
  listing({ id: "france-preparation-rental", broker: "france", status: "preparation", purpose: "rental", askingPrice: null, monthlyRent: 2450 }),
  listing({ id: "france-coming-rental", broker: "france", status: "coming_soon", purpose: "rental", askingPrice: null, monthlyRent: 2800 }),
  listing({ id: "sandrine-offer", broker: "sandrine", status: "offer_received" }),
  listing({ id: "maxime-conditional", status: "conditional" }),
  listing({ id: "maxime-sold", status: "sold" }),
  listing({ id: "sandrine-rented", broker: "sandrine", status: "rented", purpose: "rental", askingPrice: null, monthlyRent: 2100 }),
];

const ids = (values: ReturnType<typeof filterListings>) => values.map((item) => item.id);

describe("filtres visuels Listings", () => {
  it("ouvre par défaut les Listings actifs de toute l’équipe", () => {
    expect(listingStatusFilterFromParam(null)).toBe("active");
    expect(ids(filterListings(inventory, { broker: "all", purpose: "all", status: "active", search: "" })))
      .toEqual(["maxime-active-sale"]);
  });

  it("reconnaît les filtres courtiers France, Maxime et Sandrine", () => {
    expect(listingBrokerFilterFromParam("france")).toBe("france");
    expect(listingBrokerFilterFromParam("maxime")).toBe("maxime");
    expect(listingBrokerFilterFromParam("sandrine")).toBe("sandrine");
    expect(ids(filterListings(inventory, { broker: "france", purpose: "all", status: "all", search: "" })))
      .toEqual(["france-preparation-rental", "france-coming-rental"]);
    expect(ids(filterListings(inventory, { broker: "maxime", purpose: "all", status: "all", search: "" })))
      .toEqual(["maxime-active-sale", "maxime-conditional", "maxime-sold"]);
    expect(ids(filterListings(inventory, { broker: "sandrine", purpose: "all", status: "all", search: "" })))
      .toEqual(["sandrine-offer", "sandrine-rented"]);
  });

  it("filtre séparément la Vente et la Location", () => {
    expect(listingPurposeFilterFromParam("sale")).toBe("sale");
    expect(listingPurposeFilterFromParam("rental")).toBe("rental");
    expect(ids(filterListings(inventory, { broker: "all", purpose: "sale", status: "all", search: "" })))
      .toEqual(["maxime-active-sale", "sandrine-offer", "maxime-conditional", "maxime-sold"]);
    expect(ids(filterListings(inventory, { broker: "all", purpose: "rental", status: "all", search: "" })))
      .toEqual(["france-preparation-rental", "france-coming-rental", "sandrine-rented"]);
  });

  it("mappe Actifs, À venir, Offres, Conditionnels, Vendus / Loués et Tous", () => {
    expect(LISTING_STATUS_FILTERS.map((filter) => filter.label)).toEqual([
      "Actifs", "À venir", "Offres", "Conditionnels", "Vendus / Loués", "Tous",
    ]);
    expect(ids(filterListings(inventory, { broker: "all", purpose: "all", status: "upcoming", search: "" })))
      .toEqual(["france-preparation-rental", "france-coming-rental"]);
    expect(ids(filterListings(inventory, { broker: "all", purpose: "all", status: "offers", search: "" })))
      .toEqual(["sandrine-offer"]);
    expect(ids(filterListings(inventory, { broker: "all", purpose: "all", status: "conditional", search: "" })))
      .toEqual(["maxime-conditional"]);
    expect(ids(filterListings(inventory, { broker: "all", purpose: "all", status: "closed", search: "" })))
      .toEqual(["maxime-sold", "sandrine-rented"]);
    expect(filterListings(inventory, { broker: "all", purpose: "all", status: "all", search: "" })).toHaveLength(inventory.length);
  });

  it("combine courtier, statut, finalité et recherche", () => {
    expect(ids(filterListings(inventory, { broker: "france", purpose: "rental", status: "upcoming", search: "Deux-Montagnes" })))
      .toEqual(["france-preparation-rental", "france-coming-rental"]);
  });
});

describe("présentation des cartes Listings", () => {
  it("recherche localement une adresse et un numéro Centris sans tenir compte de la casse", () => {
    const item = listing({ id: "one", city: "Montréal", centrisNumber: "ABC-987" });
    expect(listingMatchesSearch(item, "MONTRÉAL")).toBe(true);
    expect(listingMatchesSearch(item, "abc-987")).toBe(true);
    expect(listingMatchesSearch(item, "Laval")).toBe(false);
  });

  it("construit l’adresse avec le numéro civique, l’appartement et la localité", () => {
    expect(listingAddressLines(listing({ id: "one", apartment: "6" })))
      .toEqual(["1403 rue de Normandie, app. 6", "Deux-Montagnes, QC J7R 1T1"]);
  });

  it("formate la Vente et la Location en dollars canadiens", () => {
    const sale = listingPriceLabel(listing({ id: "sale" })).replace(/\s/g, " ");
    const rental = listingPriceLabel(listing({ id: "rental", purpose: "rental", askingPrice: null, monthlyRent: 2450 })).replace(/\s/g, " ");
    expect(sale).toContain("799 000 $");
    expect(rental).toContain("2 450 $ / mois");
    expect(listingPriceLabel(listing({ id: "empty-rental", purpose: "rental", askingPrice: null, monthlyRent: null }))).toBe("Loyer non renseigné");
  });

  it("résout tous les propriétaires depuis une seule table de correspondance en mémoire", () => {
    const names = buildContactNameMap([
      contact("owner-1", "Jean", "Tremblay"),
      contact("owner-2", "Marie", "Tremblay"),
    ]);
    expect(listingOwnerNames(listing({ id: "one", ownerContactIds: ["owner-1", "owner-2"] }), names))
      .toEqual(["Jean Tremblay", "Marie Tremblay"]);
  });
});
