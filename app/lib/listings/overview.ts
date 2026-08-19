import type {
  Listing,
  ListingBroker,
  ListingExpirationLevel,
  ListingOverview,
  ListingPurpose,
} from "../../data/listing-types";
import { getSupabaseAdmin } from "../supabase/server";
import { listingAddressLines } from "./presentation";
import { mapListing } from "./server-service";
import type { ListingRow } from "./persistence";

const MARKET_STATUSES = new Set(["preparation", "coming_soon", "active", "offer_received", "conditional"]);
const DAYS_ON_MARKET_STATUSES = new Set(["active", "offer_received", "conditional"]);
const CLOSED_STATUSES = new Set(["sold", "rented", "expired", "withdrawn"]);
const OPEN_OFFER_STATUSES = new Set(["received", "negotiating", "countered"]);
export const LISTING_OVERVIEW_BATCH_SIZE = 150;
const torontoCalendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
});

export type OverviewOfferRow = { listing_id: string; status: string };
export type OverviewTaskRow = { listing_id: string; completed: boolean };
export type ListingOverviewFilters = { broker?: ListingBroker; purpose?: ListingPurpose };

export type ListingOverviewRepository = {
  loadListings: (filters: ListingOverviewFilters) => Promise<Listing[]>;
  loadOpenOffers: (listingIds: ReadonlyArray<string>) => Promise<OverviewOfferRow[]>;
  loadTasks: (listingIds: ReadonlyArray<string>) => Promise<OverviewTaskRow[]>;
};

function utcDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

function dayDifference(value: string, today: Date) {
  const parts = Object.fromEntries(torontoCalendar.formatToParts(today).map((part) => [part.type, part.value]));
  const current = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return Math.round((utcDate(value).getTime() - current) / 86_400_000);
}

export function getListingDaysOnMarket(listing: Pick<Listing, "listingDate">, today = new Date()) {
  if (!listing.listingDate) return null;
  return Math.max(1, 1 - dayDifference(listing.listingDate, today));
}

export function getListingExpirationInfo(listing: Pick<Listing, "expirationDate" | "status">, today = new Date()) {
  if (!listing.expirationDate || CLOSED_STATUSES.has(listing.status)) return null;
  const days = dayDifference(listing.expirationDate, today);
  if (days > 30) return null;
  const level: ListingExpirationLevel = days < 0 ? "overdue" : days <= 7 ? "urgent" : days <= 14 ? "watch" : "upcoming";
  return { days, level, label: formatListingExpirationCountdown(days) };
}

export function formatListingExpirationCountdown(days: number) {
  if (days === 0) return "Expire aujourd’hui";
  if (days < 0) return `Échéance dépassée de ${Math.abs(days)} jour${Math.abs(days) === 1 ? "" : "s"}`;
  return `Expire dans ${days} jour${days === 1 ? "" : "s"}`;
}

export async function loadOverviewRowsInBatches<T>(
  listingIds: ReadonlyArray<string>,
  loadBatch: (ids: ReadonlyArray<string>) => Promise<T[]>,
  batchSize = LISTING_OVERVIEW_BATCH_SIZE,
) {
  const ids = [...new Set(listingIds)];
  if (ids.length === 0) return [];
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += batchSize) batches.push(ids.slice(index, index + batchSize));
  return (await Promise.all(batches.map(loadBatch))).flat();
}

export function calculateListingOverview(
  listings: ReadonlyArray<Listing>,
  offers: ReadonlyArray<OverviewOfferRow>,
  tasks: ReadonlyArray<OverviewTaskRow>,
  today = new Date(),
): ListingOverview {
  const listingIds = new Set(listings.map((listing) => listing.id));
  const relevantOffers = offers.filter((offer) => listingIds.has(offer.listing_id) && OPEN_OFFER_STATUSES.has(offer.status));
  const offersByListing = new Map<string, OverviewOfferRow[]>();
  for (const offer of relevantOffers) offersByListing.set(offer.listing_id, [...(offersByListing.get(offer.listing_id) ?? []), offer]);
  const tasksByListing = new Map<string, OverviewTaskRow[]>();
  for (const task of tasks) if (listingIds.has(task.listing_id)) tasksByListing.set(task.listing_id, [...(tasksByListing.get(task.listing_id) ?? []), task]);

  const expiringListings = listings.flatMap((listing) => {
    const expiration = getListingExpirationInfo(listing, today);
    return expiration && listing.expirationDate ? [{
      listingId: listing.id,
      address: listingAddressLines(listing)[0],
      broker: listing.broker,
      purpose: listing.purpose,
      expirationDate: listing.expirationDate,
      daysUntilExpiration: expiration.days,
      level: expiration.level,
      label: expiration.label,
    }] : [];
  }).sort((a, b) => a.daysUntilExpiration - b.daysUntilExpiration);

  const attentionItems = listings.flatMap((listing) => {
    const address = listingAddressLines(listing)[0];
    const base = { listingId: listing.id, address, broker: listing.broker, purpose: listing.purpose };
    const items: ListingOverview["attentionItems"] = [];
    const expiration = getListingExpirationInfo(listing, today);
    if (expiration) items.push({ ...base, kind: "expiration", label: expiration.label, level: expiration.level });
    const listingOffers = offersByListing.get(listing.id) ?? [];
    if (listingOffers.some((offer) => offer.status === "negotiating" || offer.status === "countered")) {
      items.push({ ...base, kind: "open_offer", label: "Offre en négociation", level: "attention" });
    }
    if (listing.status === "conditional") items.push({ ...base, kind: "conditional", label: "Listing conditionnel", level: "attention" });
    const days = getListingDaysOnMarket(listing, today);
    if (listing.status === "active" && days !== null && days >= 45) items.push({ ...base, kind: "long_market", label: `${days} jours en marché`, level: "neutral" });
    const listingTasks = tasksByListing.get(listing.id) ?? [];
    const remaining = listingTasks.filter((task) => !task.completed).length;
    if (listingTasks.length > 0 && remaining > 0) items.push({ ...base, kind: "incomplete_checklist", label: `${remaining} action${remaining === 1 ? "" : "s"} de mise en marché à compléter`, level: "neutral" });
    return items;
  });

  const marketListings = listings.filter((listing) => MARKET_STATUSES.has(listing.status));
  const daysValues = listings
    .filter((listing) => DAYS_ON_MARKET_STATUSES.has(listing.status))
    .map((listing) => getListingDaysOnMarket(listing, today))
    .filter((value): value is number => value !== null);

  return {
    activeListings: listings.filter((listing) => listing.status === "active").length,
    activeSaleInventoryValue: marketListings.filter((listing) => listing.purpose === "sale").reduce((total, listing) => total + (listing.askingPrice ?? 0), 0),
    activeRentalMonthlyTotal: marketListings.filter((listing) => listing.purpose === "rental").reduce((total, listing) => total + (listing.monthlyRent ?? 0), 0),
    openOffers: relevantOffers.length,
    expiringListings,
    averageDaysOnMarket: daysValues.length ? Math.round(daysValues.reduce((total, value) => total + value, 0) / daysValues.length) : null,
    attentionItems,
  };
}

export function createSupabaseListingOverviewRepository(): ListingOverviewRepository {
  const admin = () => getSupabaseAdmin();
  return {
    async loadListings(filters) {
      let query = admin().from("listings").select("*");
      if (filters.broker) query = query.eq("broker", filters.broker);
      if (filters.purpose) query = query.eq("purpose", filters.purpose);
      const { data, error } = await query.order("updated_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as ListingRow[]).map((row) => mapListing(row, []));
    },
    loadOpenOffers: (listingIds) => loadOverviewRowsInBatches(listingIds, async (batch) => {
      const { data, error } = await admin().from("listing_offers").select("listing_id, status")
        .in("listing_id", [...batch]).in("status", [...OPEN_OFFER_STATUSES]);
      if (error) throw error;
      return (data ?? []) as OverviewOfferRow[];
    }),
    loadTasks: (listingIds) => loadOverviewRowsInBatches(listingIds, async (batch) => {
      const { data, error } = await admin().from("listing_marketing_tasks").select("listing_id, completed").in("listing_id", [...batch]);
      if (error) throw error;
      return (data ?? []) as OverviewTaskRow[];
    }),
  };
}

export function createListingOverviewService(repository: ListingOverviewRepository) {
  return async (filters: ListingOverviewFilters = {}, today = new Date()) => {
    const listings = await repository.loadListings(filters);
    if (listings.length === 0) return calculateListingOverview([], [], [], today);
    const ids = listings.map((listing) => listing.id);
    const [offers, tasks] = await Promise.all([repository.loadOpenOffers(ids), repository.loadTasks(ids)]);
    return calculateListingOverview(listings, offers, tasks, today);
  };
}

const overviewService = createListingOverviewService(createSupabaseListingOverviewRepository());
export const getListingsOverview = (filters: ListingOverviewFilters = {}, today = new Date()) => overviewService(filters, today);
