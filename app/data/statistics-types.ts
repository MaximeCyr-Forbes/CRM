import type { ClientProvenance, ContactBroker, ContactPriority } from "./contact-types";
import type { ListingBroker, ListingPurpose, ListingStatus } from "./listing-types";
import type { TransactionBroker, TransactionStatus, TransactionType } from "./transaction-types";

export const STATISTICS_PERIODS = ["month", "three_months", "year", "twelve_months", "custom"] as const;
export type StatisticsPeriod = (typeof STATISTICS_PERIODS)[number];
export type StatisticsBroker = "team" | TransactionBroker;

export type StatisticsContactRow = {
  id: string;
  broker: ContactBroker;
  priority: ContactPriority | null;
  clientProvenance: ClientProvenance;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
  createdAt: string;
};

export type StatisticsListingRow = {
  id: string;
  broker: ListingBroker;
  purpose: ListingPurpose;
  status: ListingStatus;
  listingDate: string | null;
  createdAt: string;
};

export type StatisticsOfferRow = {
  id: string;
  listingId: string;
  purpose: ListingPurpose;
  offerDate: string;
  status: string;
};

export type StatisticsListingTransactionLinkRow = {
  listingId: string;
  offerId: string;
  transactionId: string;
};

export type StatisticsTransactionRow = {
  id: string;
  type: TransactionType;
  broker: TransactionBroker;
  price: number | null;
  soldPrice: number | null;
  promiseDate: string | null;
  notaryDate: string | null;
  saleFinalizedAt: string | null;
  purchaseFinalizedAt: string | null;
  status: TransactionStatus;
  createdAt: string;
};

export type StatisticsTransactionContactRow = {
  transactionId: string;
  contactId: string;
};

export type StatisticsDataset = {
  contacts: StatisticsContactRow[];
  listings: StatisticsListingRow[];
  offers: StatisticsOfferRow[];
  listingTransactionLinks: StatisticsListingTransactionLinkRow[];
  transactions: StatisticsTransactionRow[];
  transactionContacts: StatisticsTransactionContactRow[];
};

export type StatisticsComparison = {
  current: number;
  previous: number;
  changePercent: number | null;
  changeLabel: "new" | "unavailable" | null;
};

export type StatisticsSnapshot = {
  broker: StatisticsBroker;
  period: { key: StatisticsPeriod; from: string; to: string; label: string };
  kpis: {
    newContacts: number;
    newListings: number;
    acceptedOffers: number;
    saleTransactions: number;
    purchaseTransactions: number;
    saleVolume: number;
    purchaseVolume: number;
    activeListings: number;
  };
  currentMonth: {
    newContacts: StatisticsComparison;
    newListings: StatisticsComparison;
    acceptedOffers: StatisticsComparison;
    saleTransactions: StatisticsComparison;
    purchaseTransactions: StatisticsComparison;
    saleVolume: StatisticsComparison;
    purchaseVolume: StatisticsComparison;
  };
  listingPerformance: {
    listingsTaken: number;
    listingsWithAcceptedPa: number;
    listingsSold: number;
    listingToPaRate: number | null;
    paToSoldRate: number | null;
    averagePaDays: number | null;
    medianPaDays: number | null;
    averageSaleDays: number | null;
    medianSaleDays: number | null;
    paDelaySampleSize: number;
    saleDelaySampleSize: number;
  };
  provenance: Array<{
    key: Exclude<ClientProvenance, null> | "unreported";
    label: string;
    contacts: number;
    share: number;
    contactsWithTransaction: number;
    conversionRate: number;
  }>;
  brokerActivity: Array<{
    broker: TransactionBroker;
    newContacts: number;
    listingsTaken: number;
    acceptedOffers: number;
    saleTransactions: number;
    purchaseTransactions: number;
    saleVolume: number;
    purchaseVolume: number;
    followUps: number;
  }>;
  contactHealth: {
    totalContacts: number;
    unassigned: number;
    hot: number;
    warm: number;
    cold: number;
    followUpsThisWeek: number;
    overdueFollowUps: number;
    neverContacted: number;
    inactive90Days: number;
  };
  trends: Array<{
    month: string;
    label: string;
    listings: number;
    sales: number;
    purchases: number;
    saleVolume: number;
    purchaseVolume: number;
  }>;
  definitions: {
    purchaseBusinessDate: string;
    paDelay: string;
    saleDelay: string;
  };
};
