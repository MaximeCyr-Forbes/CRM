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

export type ListingInterestLevel = "low" | "medium" | "high";

export const LISTING_INTEREST_LABELS: Record<ListingInterestLevel, string> = {
  low: "Faible",
  medium: "Moyen",
  high: "Fort",
};

export type ListingMarketingTask = {
  id: string;
  listingId: string;
  title: string;
  taskKey: string | null;
  completed: boolean;
  completedAt: string | null;
  completedBy: ListingBroker | null;
  sortOrder: number;
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ListingVisit = {
  id: string;
  listingId: string;
  visitDate: string;
  visitTime: string | null;
  visitingBrokerName: string;
  visitingBrokerAgency: string;
  buyerNames: string;
  feedback: string;
  interestLevel: ListingInterestLevel | null;
  createdBy: ListingBroker | null;
  createdAt: string;
  updatedAt: string;
};

export type ListingVisitDraft = Pick<
  ListingVisit,
  | "visitDate"
  | "visitTime"
  | "visitingBrokerName"
  | "visitingBrokerAgency"
  | "buyerNames"
  | "feedback"
  | "interestLevel"
>;

export const LISTING_OFFER_STATUSES = [
  "received",
  "negotiating",
  "countered",
  "accepted",
  "rejected",
  "withdrawn",
  "expired",
] as const;

export type ListingOfferStatus = (typeof LISTING_OFFER_STATUSES)[number];

export const LISTING_OFFER_STATUS_LABELS: Record<ListingOfferStatus, string> = {
  received: "Reçue",
  negotiating: "En négociation",
  countered: "Contre-offre",
  accepted: "Acceptée",
  rejected: "Refusée",
  withdrawn: "Retirée",
  expired: "Expirée",
};

export type ListingOffer = {
  id: string;
  listingId: string;
  purpose: ListingPurpose;
  offerDate: string;
  amount: number;
  status: ListingOfferStatus;
  buyerNames: string;
  collaboratingBrokerName: string;
  collaboratingBrokerAgency: string;
  notes: string;
  acceptedAt: string | null;
  createdBy: ListingBroker | null;
  createdAt: string;
  updatedAt: string;
};

export type ListingOfferDraft = Pick<
  ListingOffer,
  | "offerDate"
  | "amount"
  | "status"
  | "buyerNames"
  | "collaboratingBrokerName"
  | "collaboratingBrokerAgency"
  | "notes"
>;

export type ListingTransactionLink = {
  listingId: string;
  offerId: string;
  transactionId: string;
  createdAt: string;
  transaction: {
    status: string;
    price: number | null;
    promiseDate: string | null;
    broker: ListingBroker;
  };
};

export type ListingActivityEventType =
  | "listing_created"
  | "status_changed"
  | "price_changed"
  | "rent_changed"
  | "purpose_changed"
  | "broker_changed"
  | "marketing_task_completed"
  | "marketing_task_reopened"
  | "custom_task_added"
  | "custom_task_updated"
  | "custom_task_deleted"
  | "visit_added"
  | "visit_updated"
  | "visit_deleted"
  | "offer_added"
  | "offer_updated"
  | "offer_status_changed"
  | "offer_deleted"
  | "transaction_created"
  | "note_updated";

export type ListingActivityEntry = {
  id: string;
  listingId: string;
  eventType: ListingActivityEventType;
  title: string;
  detail: string;
  actorBroker: ListingBroker | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ListingPriceHistoryEntry = {
  id: string;
  listingId: string;
  purpose: ListingPurpose;
  amount: number | null;
  changedBy: ListingBroker | null;
  changedAt: string;
};

export type ListingTrackingData = {
  tasks: ListingMarketingTask[];
  visits: ListingVisit[];
  activity: ListingActivityEntry[];
  priceHistory: ListingPriceHistoryEntry[];
};
