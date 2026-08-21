import {
  LISTING_BROKERS,
  LISTING_PROPERTY_TYPES,
  LISTING_PURPOSES,
  type Listing,
  type ListingBroker,
  type ListingDraft,
  type ListingPurpose,
  type ListingStatus,
} from "../../data/listing-types";

const COMMON_LISTING_STATUSES = [
  "preparation",
  "coming_soon",
  "active",
  "offer_received",
  "conditional",
] as const satisfies ReadonlyArray<ListingStatus>;

export const SALE_LISTING_STATUSES = [
  ...COMMON_LISTING_STATUSES,
  "sold",
  "expired",
  "withdrawn",
] as const satisfies ReadonlyArray<ListingStatus>;

export const RENTAL_LISTING_STATUSES = [
  ...COMMON_LISTING_STATUSES,
  "rented",
  "expired",
  "withdrawn",
] as const satisfies ReadonlyArray<ListingStatus>;

export function statusesForListingPurpose(purpose: ListingPurpose): ReadonlyArray<ListingStatus> {
  return purpose === "rental" ? RENTAL_LISTING_STATUSES : SALE_LISTING_STATUSES;
}

export function statusesForListingEditor(
  purpose: ListingPurpose,
  mode: "create" | "edit",
  initialStatus: ListingStatus,
): ReadonlyArray<ListingStatus> {
  const statuses = statusesForListingPurpose(purpose);
  if (mode === "edit" && purpose === "sale" && initialStatus !== "sold") {
    return statuses.filter((status) => status !== "sold");
  }
  return statuses;
}

export function validStatusForListingPurpose(purpose: ListingPurpose, status: ListingStatus) {
  return statusesForListingPurpose(purpose).includes(status) ? status : "active";
}

export function canMarkListingSold(listing: Pick<Listing, "purpose" | "status">) {
  return listing.purpose === "sale"
    && listing.status !== "sold"
    && listing.status !== "rented"
    && listing.status !== "withdrawn";
}

export function normalizeListingCentrisNumber(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function findListingWithCentrisNumber(
  listings: ReadonlyArray<Listing>,
  centrisNumber: string,
) {
  const normalized = normalizeListingCentrisNumber(centrisNumber);
  if (!normalized) return null;
  return listings.find((listing) => normalizeListingCentrisNumber(listing.centrisNumber) === normalized) ?? null;
}

export function acquireListingSubmissionLock(lock: { current: boolean }) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseListingSubmissionLock(lock: { current: boolean }) {
  lock.current = false;
}

export function emptyListingDraft(broker: ListingBroker): ListingDraft {
  return {
    civicNumber: "",
    address: "",
    apartment: "",
    city: "",
    province: "QC",
    postalCode: "",
    country: "Canada",
    centrisNumber: "",
    broker,
    status: "preparation",
    purpose: "sale",
    askingPrice: null,
    monthlyRent: null,
    propertyType: "residential",
    listingDate: null,
    expirationDate: null,
    centrisUrl: "",
    publicUrl: "",
    primaryImageUrl: "",
    generalNotes: "",
    ownerContactIds: [],
  };
}

export function listingDraftFromListing(listing: Listing): ListingDraft {
  return {
    civicNumber: listing.civicNumber,
    address: listing.address,
    apartment: listing.apartment,
    city: listing.city,
    province: listing.province,
    postalCode: listing.postalCode,
    country: listing.country,
    centrisNumber: listing.centrisNumber,
    broker: listing.broker,
    status: listing.status,
    purpose: listing.purpose,
    askingPrice: listing.askingPrice,
    monthlyRent: listing.monthlyRent,
    propertyType: listing.propertyType,
    listingDate: listing.listingDate,
    expirationDate: listing.expirationDate,
    centrisUrl: listing.centrisUrl,
    publicUrl: listing.publicUrl,
    primaryImageUrl: listing.primaryImageUrl,
    generalNotes: listing.generalNotes,
    ownerContactIds: [...listing.ownerContactIds],
  };
}

export function toggleListingOwner(ownerContactIds: ReadonlyArray<string>, contactId: string) {
  return ownerContactIds.includes(contactId)
    ? ownerContactIds.filter((id) => id !== contactId)
    : [...ownerContactIds, contactId];
}

function optionalAmount(value: string) {
  if (!value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

export type PreparedListingDraft =
  | { draft: ListingDraft; error: null }
  | { draft: null; error: string };

export function prepareListingDraft(
  values: ListingDraft,
  askingPriceInput: string,
  monthlyRentInput: string,
): PreparedListingDraft {
  if (!LISTING_PURPOSES.includes(values.purpose)) return { draft: null, error: "Sélectionnez un type de mandat valide." };
  if (!LISTING_BROKERS.includes(values.broker)) return { draft: null, error: "Sélectionnez un courtier responsable." };
  if (!LISTING_PROPERTY_TYPES.includes(values.propertyType)) return { draft: null, error: "Sélectionnez un type de propriété valide." };
  if (!statusesForListingPurpose(values.purpose).includes(values.status)) {
    return { draft: null, error: "Sélectionnez un statut compatible avec le type de mandat." };
  }
  if (!values.address.trim()) return { draft: null, error: "Ajoutez au minimum une rue ou une adresse identifiable." };
  if (values.listingDate && values.expirationDate && values.expirationDate < values.listingDate) {
    return { draft: null, error: "La date d’expiration doit être égale ou postérieure à la date de mise en marché." };
  }

  const askingPrice = optionalAmount(askingPriceInput);
  const monthlyRent = optionalAmount(monthlyRentInput);
  if (values.purpose === "sale" && askingPrice === undefined) {
    return { draft: null, error: "Le prix demandé doit être un montant positif ou nul." };
  }
  if (values.purpose === "rental" && monthlyRent === undefined) {
    return { draft: null, error: "Le loyer mensuel doit être un montant positif ou nul." };
  }

  return {
    error: null,
    draft: {
      ...values,
      civicNumber: values.civicNumber.trim(),
      address: values.address.trim(),
      apartment: values.apartment.trim(),
      city: values.city.trim(),
      province: values.province.trim(),
      postalCode: values.postalCode.trim(),
      country: values.country.trim(),
      centrisNumber: values.centrisNumber.trim(),
      askingPrice: values.purpose === "sale" ? askingPrice ?? null : null,
      monthlyRent: values.purpose === "rental" ? monthlyRent ?? null : null,
      centrisUrl: values.centrisUrl.trim(),
      publicUrl: values.publicUrl.trim(),
      primaryImageUrl: values.primaryImageUrl.trim(),
      generalNotes: values.generalNotes.trim(),
      ownerContactIds: [...new Set(values.ownerContactIds)],
    },
  };
}
