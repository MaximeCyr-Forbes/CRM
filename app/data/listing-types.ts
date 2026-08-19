import { CONTACT_BROKERS } from "./contact-types";

export const LISTING_STATUSES = [
  "preparation",
  "coming_soon",
  "active",
  "offer_received",
  "conditional",
  "sold",
  "rented",
  "expired",
  "withdrawn",
] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  preparation: "Préparation",
  coming_soon: "À venir",
  active: "Actif",
  offer_received: "Offre reçue",
  conditional: "Conditionnel",
  sold: "Vendu",
  rented: "Loué",
  expired: "Expiré",
  withdrawn: "Retiré",
};

export const LISTING_PROPERTY_TYPES = [
  "residential",
  "condo",
  "income_property",
  "land",
  "commercial",
  "other",
] as const;

export type ListingPropertyType = (typeof LISTING_PROPERTY_TYPES)[number];

export const LISTING_PROPERTY_TYPE_LABELS: Record<ListingPropertyType, string> = {
  residential: "Résidentiel",
  condo: "Copropriété",
  income_property: "Immeuble à revenus",
  land: "Terrain",
  commercial: "Commercial",
  other: "Autre",
};

export const LISTING_BROKERS = CONTACT_BROKERS;
export type ListingBroker = (typeof LISTING_BROKERS)[number];

export const LISTING_PURPOSES = ["sale", "rental"] as const;
export type ListingPurpose = (typeof LISTING_PURPOSES)[number];

export const LISTING_PURPOSE_LABELS: Record<ListingPurpose, string> = {
  sale: "Vente",
  rental: "Location",
};

export type Listing = {
  id: string;
  civicNumber: string;
  address: string;
  apartment: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  centrisNumber: string;
  broker: ListingBroker;
  status: ListingStatus;
  purpose: ListingPurpose;
  askingPrice: number | null;
  monthlyRent: number | null;
  propertyType: ListingPropertyType;
  listingDate: string | null;
  expirationDate: string | null;
  centrisUrl: string;
  publicUrl: string;
  primaryImageUrl: string;
  generalNotes: string;
  ownerContactIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ListingDraft = Pick<
  Listing,
  | "civicNumber"
  | "address"
  | "apartment"
  | "city"
  | "province"
  | "postalCode"
  | "country"
  | "centrisNumber"
  | "broker"
  | "status"
  | "purpose"
  | "askingPrice"
  | "monthlyRent"
  | "propertyType"
  | "listingDate"
  | "expirationDate"
  | "centrisUrl"
  | "publicUrl"
  | "primaryImageUrl"
  | "generalNotes"
  | "ownerContactIds"
>;
