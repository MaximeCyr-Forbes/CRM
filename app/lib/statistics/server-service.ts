import type {
  StatisticsContactRow,
  StatisticsDataset,
  StatisticsListingRow,
  StatisticsListingTransactionLinkRow,
  StatisticsOfferRow,
  StatisticsSnapshot,
  StatisticsTransactionContactRow,
  StatisticsTransactionRow,
} from "../../data/statistics-types";
import type { StatisticsBroker, StatisticsPeriod } from "../../data/statistics-types";
import { getSupabaseAdmin } from "../supabase/server";
import { calculateStatistics, quebecDateKey, resolveStatisticsPeriod } from "./calculations";

const PAGE_SIZE = 1000;

type ContactRow = {
  id: string;
  broker: StatisticsContactRow["broker"];
  priority: StatisticsContactRow["priority"];
  client_provenance: StatisticsContactRow["clientProvenance"];
  last_contact_date: string | null;
  next_follow_up_date: string | null;
  created_at: string;
};

type ListingRow = {
  id: string;
  broker: StatisticsListingRow["broker"];
  purpose: StatisticsListingRow["purpose"];
  status: StatisticsListingRow["status"];
  listing_date: string | null;
  created_at: string;
};

type OfferRow = {
  id: string;
  listing_id: string;
  purpose: StatisticsOfferRow["purpose"];
  offer_date: string;
  status: string;
};

type LinkRow = { listing_id: string; offer_id: string; transaction_id: string };

type TransactionRow = {
  id: string;
  type: StatisticsTransactionRow["type"];
  broker: StatisticsTransactionRow["broker"];
  price: number | string | null;
  sold_price: number | string | null;
  promise_date: string | null;
  notary_date: string | null;
  sale_finalized_at: string | null;
  purchase_finalized_at: string | null;
  status: StatisticsTransactionRow["status"];
  created_at: string;
};

type TransactionContactRow = { transaction_id: string; contact_id: string };

async function listAllRows<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await getSupabaseAdmin()
      .from(table)
      .select(columns)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function amount(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadStatisticsDataset(): Promise<StatisticsDataset> {
  const [contacts, listings, offers, links, transactions, transactionContacts] = await Promise.all([
    listAllRows<ContactRow>("contacts", "id, broker, priority, client_provenance, last_contact_date, next_follow_up_date, created_at"),
    listAllRows<ListingRow>("listings", "id, broker, purpose, status, listing_date, created_at"),
    listAllRows<OfferRow>("listing_offers", "id, listing_id, purpose, offer_date, status"),
    listAllRows<LinkRow>("listing_transaction_links", "listing_id, offer_id, transaction_id"),
    listAllRows<TransactionRow>("transactions", "id, type, broker, price, sold_price, promise_date, notary_date, sale_finalized_at, purchase_finalized_at, status, created_at"),
    listAllRows<TransactionContactRow>("transaction_contacts", "transaction_id, contact_id"),
  ]);
  return {
    contacts: contacts.map((row) => ({
      id: row.id,
      broker: row.broker,
      priority: row.priority,
      clientProvenance: row.client_provenance,
      lastContactDate: row.last_contact_date,
      nextFollowUpDate: row.next_follow_up_date,
      createdAt: row.created_at,
    })),
    listings: listings.map((row) => ({
      id: row.id,
      broker: row.broker,
      purpose: row.purpose,
      status: row.status,
      listingDate: row.listing_date,
      createdAt: row.created_at,
    })),
    offers: offers.map((row) => ({
      id: row.id,
      listingId: row.listing_id,
      purpose: row.purpose,
      offerDate: row.offer_date,
      status: row.status,
    })),
    listingTransactionLinks: links.map((row): StatisticsListingTransactionLinkRow => ({
      listingId: row.listing_id,
      offerId: row.offer_id,
      transactionId: row.transaction_id,
    })),
    transactions: transactions.map((row) => ({
      id: row.id,
      type: row.type,
      broker: row.broker,
      price: amount(row.price),
      soldPrice: amount(row.sold_price),
      promiseDate: row.promise_date,
      notaryDate: row.notary_date,
      saleFinalizedAt: row.sale_finalized_at,
      purchaseFinalizedAt: row.purchase_finalized_at,
      status: row.status,
      createdAt: row.created_at,
    })),
    transactionContacts: transactionContacts.map((row): StatisticsTransactionContactRow => ({
      transactionId: row.transaction_id,
      contactId: row.contact_id,
    })),
  };
}

export async function getStatistics(input: {
  period: StatisticsPeriod;
  broker: StatisticsBroker;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): Promise<StatisticsSnapshot> {
  const today = quebecDateKey(input.now ?? new Date());
  if (!today) throw new TypeError("Date métier invalide.");
  const range = resolveStatisticsPeriod(input.period, today, input.from, input.to);
  if (!range) throw new TypeError("Période invalide.");
  return calculateStatistics(await loadStatisticsDataset(), range, input.broker, today);
}
