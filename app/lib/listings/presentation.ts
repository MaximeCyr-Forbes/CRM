import type { Contact } from "../../data/contact-types";
import { getContactName } from "../../data/contact-types";
import type {
  Listing,
  ListingBroker,
  ListingPurpose,
  ListingStatus,
} from "../../data/listing-types";
import { LISTING_BROKERS, LISTING_PURPOSES } from "../../data/listing-types";

export const LISTING_STATUS_FILTERS = [
  { key: "active", label: "Actifs", query: "active", statuses: ["active"] },
  { key: "upcoming", label: "À venir", query: "preparation,coming_soon", statuses: ["preparation", "coming_soon"] },
  { key: "offers", label: "Offres", query: "offer_received", statuses: ["offer_received"] },
  { key: "conditional", label: "Conditionnels", query: "conditional", statuses: ["conditional"] },
  { key: "closed", label: "Vendus / Loués", query: "sold,rented", statuses: ["sold", "rented"] },
  { key: "all", label: "Tous", query: "all", statuses: [] },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  query: string;
  statuses: ReadonlyArray<ListingStatus>;
}>;

export type ListingStatusFilter = (typeof LISTING_STATUS_FILTERS)[number]["key"];
export type ListingBrokerFilter = "all" | ListingBroker;
export type ListingPurposeFilter = "all" | ListingPurpose;

export function listingStatusFilterFromParam(value: string | null): ListingStatusFilter {
  if (!value) return "active";
  const exact = LISTING_STATUS_FILTERS.find((filter) => filter.query === value);
  if (exact) return exact.key;
  if (value === "preparation" || value === "coming_soon") return "upcoming";
  if (value === "sold" || value === "rented") return "closed";
  return "active";
}

export function listingBrokerFilterFromParam(value: string | null): ListingBrokerFilter {
  return LISTING_BROKERS.includes(value as ListingBroker) ? value as ListingBroker : "all";
}

export function listingPurposeFilterFromParam(value: string | null): ListingPurposeFilter {
  return LISTING_PURPOSES.includes(value as ListingPurpose) ? value as ListingPurpose : "all";
}

export function listingMatchesSearch(listing: Listing, search: string) {
  const query = search.trim().toLocaleLowerCase("fr-CA");
  if (!query) return true;
  return [
    listing.civicNumber,
    listing.address,
    listing.apartment,
    listing.city,
    listing.province,
    listing.postalCode,
    listing.centrisNumber,
  ].some((value) => value.toLocaleLowerCase("fr-CA").includes(query));
}

export function filterListings(
  listings: ReadonlyArray<Listing>,
  filters: {
    broker: ListingBrokerFilter;
    purpose: ListingPurposeFilter;
    status: ListingStatusFilter;
    search: string;
  },
) {
  const statusFilter = LISTING_STATUS_FILTERS.find((filter) => filter.key === filters.status)
    ?? LISTING_STATUS_FILTERS[0];
  return listings.filter((listing) => {
    if (filters.broker !== "all" && listing.broker !== filters.broker) return false;
    if (filters.purpose !== "all" && listing.purpose !== filters.purpose) return false;
    const acceptedStatuses = statusFilter.statuses as ReadonlyArray<ListingStatus>;
    if (acceptedStatuses.length > 0 && !acceptedStatuses.includes(listing.status)) return false;
    return listingMatchesSearch(listing, filters.search);
  });
}

export function listingAddressLines(listing: Listing) {
  const apartment = listing.apartment.trim();
  const apartmentLabel = apartment && !/^(app\.?|apt\.?|appartement|unit[eé]|suite|#)/i.test(apartment)
    ? `app. ${apartment}`
    : apartment;
  const street = [listing.civicNumber.trim(), listing.address.trim()].filter(Boolean).join(" ");
  const firstLine = [street, apartmentLabel].filter(Boolean).join(", ") || "Adresse à confirmer";
  const provinceAndPostal = [listing.province.trim(), listing.postalCode.trim()].filter(Boolean).join(" ");
  const secondLine = [listing.city.trim(), provinceAndPostal].filter(Boolean).join(", ");
  return [firstLine, secondLine].filter(Boolean);
}

const currencyFormatter = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export function listingPriceLabel(listing: Listing) {
  if (listing.purpose === "rental") {
    return listing.monthlyRent === null
      ? "Loyer non renseigné"
      : `${currencyFormatter.format(listing.monthlyRent)} / mois`;
  }
  return listing.askingPrice === null
    ? "Prix non renseigné"
    : currencyFormatter.format(listing.askingPrice);
}

export function buildContactNameMap(contacts: ReadonlyArray<Contact>) {
  return new Map(contacts.map((contact) => [contact.id, getContactName(contact)]));
}

export function listingOwnerNames(listing: Listing, contactNames: ReadonlyMap<string, string>) {
  return listing.ownerContactIds
    .map((contactId) => contactNames.get(contactId))
    .filter((name): name is string => Boolean(name));
}

export function resolveListingOwners(listing: Listing, contacts: ReadonlyArray<Contact>) {
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  return listing.ownerContactIds.map((contactId) => ({
    contactId,
    contact: contactsById.get(contactId) ?? null,
  }));
}

const listingDateFormatter = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatListingDate(value: string | null) {
  if (!value) return "Non renseignée";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Non renseignée" : listingDateFormatter.format(date);
}
