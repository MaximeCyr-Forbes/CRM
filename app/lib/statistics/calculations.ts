import {
  CLIENT_PROVENANCE_LABELS,
  type ClientProvenance,
} from "../../data/contact-types";
import type {
  StatisticsBroker,
  StatisticsComparison,
  StatisticsDataset,
  StatisticsListingRow,
  StatisticsPeriod,
  StatisticsSnapshot,
  StatisticsTransactionRow,
  StatisticsYear,
} from "../../data/statistics-types";

const DAY_MS = 86_400_000;
const QUEBEC_TIME_ZONE = "America/Toronto";
const ACTIVE_LISTING_STATUSES = new Set(["active"]);
const ASSIGNED_BROKERS = ["maxime", "france", "sandrine"] as const;
type ReportedClientProvenance = Exclude<ClientProvenance, null>;
const PROVENANCES: Array<ReportedClientProvenance | "unreported"> = [
  "friend_family",
  "referral",
  "prospecting",
  "confia",
  "unreported",
];

export type StatisticsPeriodRange = {
  key: StatisticsPeriod;
  from: string;
  to: string;
  label: string;
};

export type ResolveStatisticsRangeInput = {
  period: StatisticsPeriod;
  year: StatisticsYear;
  from?: string | null;
  to?: string | null;
  now: string;
};

function parts(value: string) {
  return value.split("-").map(Number) as [number, number, number];
}

export function isStatisticsDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = parts(value);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function dateKey(year: number, monthIndex: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${(monthIndex + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function shiftMonthStart(value: string, delta: number) {
  const [year, month] = parts(value);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return dateKey(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1);
}

function addDays(value: string, days: number) {
  const [year, month, day] = parts(value);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return dateKey(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

function endOfMonth(value: string) {
  const [year, month] = parts(value);
  const end = new Date(Date.UTC(year, month, 0));
  return dateKey(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
}

export function quebecDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: QUEBEC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function monthYearLabel(value: string) {
  return new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value.slice(0, 7)}-01T12:00:00Z`))
    .toLocaleUpperCase("fr-CA");
}

function customRangeLabel(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", timeZone: "UTC" });
  const start = formatter.format(new Date(`${from}T12:00:00Z`)).toLocaleUpperCase("fr-CA");
  const end = formatter.format(new Date(`${to}T12:00:00Z`)).toLocaleUpperCase("fr-CA");
  return `${start} → ${end} ${to.slice(0, 4)}`;
}

export function resolveStatisticsRange(input: ResolveStatisticsRangeInput): StatisticsPeriodRange | null {
  const { period, year, from, to, now } = input;
  if (!isStatisticsDate(now)) return null;
  const [currentYear, currentMonth] = parts(now);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  if (period === "custom") {
    if (!isStatisticsDate(from) || !isStatisticsDate(to) || from > to || from < yearStart || to > yearEnd) return null;
    return { key: period, from, to, label: customRangeLabel(from, to) };
  }
  if (period === "year") return { key: period, from: yearStart, to: yearEnd, label: String(year) };
  if (period === "twelve_months") {
    if (year !== currentYear) return null;
    return { key: period, from: shiftMonthStart(now, -11), to: now, label: "12 DERNIERS MOIS" };
  }
  const referenceMonth = `${year}-${String(currentMonth).padStart(2, "0")}-01`;
  const periodEnd = year === currentYear ? now : endOfMonth(referenceMonth);
  if (period === "month") {
    return { key: period, from: referenceMonth, to: periodEnd, label: monthYearLabel(referenceMonth) };
  }
  const shiftedStart = shiftMonthStart(referenceMonth, -2);
  const fromDate = shiftedStart < yearStart ? yearStart : shiftedStart;
  return {
    key: period,
    from: fromDate,
    to: periodEnd,
    label: `${monthYearLabel(fromDate).replace(` ${year}`, "")} → ${monthYearLabel(periodEnd)}`,
  };
}

function inRange(value: string | null, range: Pick<StatisticsPeriodRange, "from" | "to">) {
  return Boolean(value && value >= range.from && value <= range.to);
}

function matchesBroker(rowBroker: string, broker: StatisticsBroker) {
  return broker === "team"
    ? ASSIGNED_BROKERS.includes(rowBroker as (typeof ASSIGNED_BROKERS)[number])
    : rowBroker === broker;
}

function dayDifference(start: string, end: string) {
  const [startYear, startMonth, startDay] = parts(start);
  const [endYear, endMonth, endDay] = parts(end);
  return Math.round((Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / DAY_MS);
}

export function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle];
}

function rate(numerator: number, denominator: number) {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 100);
}

function comparison(current: number, previous: number): StatisticsComparison {
  if (previous === 0) {
    return { current, previous, changePercent: null, changeLabel: current > 0 ? "new" : "unavailable" };
  }
  return {
    current,
    previous,
    changePercent: Math.round(((current - previous) / previous) * 100),
    changeLabel: null,
  };
}

function transactionDate(transaction: StatisticsTransactionRow) {
  if (isStatisticsDate(transaction.notaryDate)) return transaction.notaryDate;
  const finalizedAt = transaction.type === "sale" ? transaction.saleFinalizedAt : transaction.purchaseFinalizedAt;
  return quebecDateKey(finalizedAt ?? "");
}

function transactionAmount(transaction: StatisticsTransactionRow) {
  return transaction.type === "sale" ? transaction.soldPrice : transaction.price;
}

function isConcluded(transaction: StatisticsTransactionRow) {
  if (transaction.status === "cancelled") return false;
  if (transaction.type === "sale") return Boolean(transaction.saleFinalizedAt && transaction.soldPrice && transaction.soldPrice > 0);
  return Boolean(transaction.purchaseFinalizedAt && transaction.price && transaction.price > 0);
}

function validAcceptedOffers(dataset: StatisticsDataset) {
  const listings = new Map(dataset.listings.map((listing) => [listing.id, listing]));
  const transactions = new Map(dataset.transactions.map((transaction) => [transaction.id, transaction]));
  const links = new Map(dataset.listingTransactionLinks.map((link) => [link.offerId, link]));
  return dataset.offers.filter((offer) => {
    const listing = listings.get(offer.listingId);
    const link = links.get(offer.id);
    const transaction = link ? transactions.get(link.transactionId) : null;
    return offer.status === "accepted"
      && offer.purpose === "sale"
      && listing?.purpose === "sale"
      && link?.listingId === listing.id
      && transaction?.type === "sale";
  });
}

function linkedSaleTransactions(dataset: StatisticsDataset) {
  const transactions = new Map(dataset.transactions.map((transaction) => [transaction.id, transaction]));
  return dataset.listingTransactionLinks
    .map((link) => ({ link, transaction: transactions.get(link.transactionId) }))
    .filter((item): item is { link: typeof item.link; transaction: StatisticsTransactionRow } => item.transaction?.type === "sale");
}

function intervalKpis(dataset: StatisticsDataset, range: StatisticsPeriodRange, broker: StatisticsBroker) {
  const accepted = validAcceptedOffers(dataset).filter((offer) => {
    const listing = dataset.listings.find((item) => item.id === offer.listingId);
    return Boolean(listing && matchesBroker(listing.broker, broker) && inRange(offer.offerDate, range));
  });
  const transactions = dataset.transactions.filter((transaction) => matchesBroker(transaction.broker, broker)
    && isConcluded(transaction)
    && inRange(transactionDate(transaction), range));
  const sales = transactions.filter((transaction) => transaction.type === "sale");
  const purchases = transactions.filter((transaction) => transaction.type === "purchase");
  return {
    newContacts: dataset.contacts.filter((contact) => matchesBroker(contact.broker, broker) && inRange(quebecDateKey(contact.createdAt), range)).length,
    newListings: dataset.listings.filter((listing) => matchesBroker(listing.broker, broker) && inRange(listing.listingDate, range)).length,
    acceptedOffers: accepted.length,
    saleTransactions: sales.length,
    purchaseTransactions: purchases.length,
    saleVolume: sales.reduce((sum, transaction) => sum + (transactionAmount(transaction) ?? 0), 0),
    purchaseVolume: purchases.reduce((sum, transaction) => sum + (transactionAmount(transaction) ?? 0), 0),
  };
}

function listingPerformance(dataset: StatisticsDataset, range: StatisticsPeriodRange, broker: StatisticsBroker) {
  const cohort = dataset.listings.filter((listing) => listing.purpose === "sale"
    && matchesBroker(listing.broker, broker)
    && inRange(listing.listingDate, range));
  const acceptedByListing = new Map<string, string[]>();
  for (const offer of validAcceptedOffers(dataset)) {
    const dates = acceptedByListing.get(offer.listingId) ?? [];
    dates.push(offer.offerDate);
    acceptedByListing.set(offer.listingId, dates);
  }
  const salesByListing = new Map<string, string[]>();
  for (const { link, transaction } of linkedSaleTransactions(dataset)) {
    const finalized = transactionDate(transaction);
    if (!finalized || !isConcluded(transaction)) continue;
    const dates = salesByListing.get(link.listingId) ?? [];
    dates.push(finalized);
    salesByListing.set(link.listingId, dates);
  }
  const paDelays: number[] = [];
  const saleDelays: number[] = [];
  let listingsWithAcceptedPa = 0;
  let listingsSold = 0;
  for (const listing of cohort) {
    const acceptedDates = [...(acceptedByListing.get(listing.id) ?? [])].sort();
    if (acceptedDates.length > 0) {
      listingsWithAcceptedPa += 1;
      const delay = dayDifference(listing.listingDate!, acceptedDates[0]);
      if (delay >= 0) paDelays.push(delay);
    }
    const finalizedDates = [...(salesByListing.get(listing.id) ?? [])].sort();
    const sold = listing.status === "sold" || finalizedDates.length > 0;
    if (sold) listingsSold += 1;
    if (finalizedDates.length > 0) {
      const delay = dayDifference(listing.listingDate!, finalizedDates[0]);
      if (delay >= 0) saleDelays.push(delay);
    }
  }
  const soldWithPa = cohort.filter((listing) => (acceptedByListing.get(listing.id)?.length ?? 0) > 0
    && (listing.status === "sold" || (salesByListing.get(listing.id)?.length ?? 0) > 0)).length;
  return {
    listingsTaken: cohort.length,
    listingsWithAcceptedPa,
    listingsSold,
    listingToPaRate: rate(listingsWithAcceptedPa, cohort.length),
    paToSoldRate: rate(soldWithPa, listingsWithAcceptedPa),
    averagePaDays: average(paDelays),
    medianPaDays: median(paDelays),
    averageSaleDays: average(saleDelays),
    medianSaleDays: median(saleDelays),
    paDelaySampleSize: paDelays.length,
    saleDelaySampleSize: saleDelays.length,
  };
}

function monthComparisonRanges(today: string, year: StatisticsYear) {
  const [currentYear, currentMonth] = parts(today);
  const selectedFrom = `${year}-${String(currentMonth).padStart(2, "0")}-01`;
  if (year !== currentYear) {
    const previousFrom = `${year - 1}-${String(currentMonth).padStart(2, "0")}-01`;
    const title = monthYearLabel(selectedFrom);
    const comparisonLabel = monthYearLabel(previousFrom).toLocaleLowerCase("fr-CA");
    return {
      current: { key: "month", from: selectedFrom, to: endOfMonth(selectedFrom), label: title } as StatisticsPeriodRange,
      previous: { key: "month", from: previousFrom, to: endOfMonth(previousFrom), label: comparisonLabel } as StatisticsPeriodRange,
      context: {
        title,
        description: `Résultats de ${title.toLocaleLowerCase("fr-CA")} comparés à ${comparisonLabel}.`,
        comparisonLabel,
      },
    };
  }
  const previousFrom = shiftMonthStart(today, -1);
  const elapsedDays = dayDifference(selectedFrom, today);
  const previousTo = [addDays(previousFrom, elapsedDays), endOfMonth(previousFrom)].sort()[0];
  return {
    current: { key: "month", from: selectedFrom, to: today, label: "Ce mois" } as StatisticsPeriodRange,
    previous: { key: "month", from: previousFrom, to: previousTo, label: "Mois précédent" } as StatisticsPeriodRange,
    context: {
      title: "CE MOIS-CI",
      description: "Résultats du mois en cours comparés au même nombre de jours du mois précédent.",
      comparisonLabel: "la période comparable",
    },
  };
}

function trendRanges(range: StatisticsPeriodRange) {
  const months: string[] = [];
  let cursor = shiftMonthStart(range.from, 0);
  const lastMonth = shiftMonthStart(range.to, 0);
  while (cursor <= lastMonth) {
    months.push(cursor);
    cursor = shiftMonthStart(cursor, 1);
  }
  return months.slice(-12).map((month) => ({
    key: "month" as const,
    from: month < range.from ? range.from : month,
    to: endOfMonth(month) > range.to ? range.to : endOfMonth(month),
    label: new Intl.DateTimeFormat("fr-CA", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${month}T12:00:00Z`)),
  }));
}

export function calculateStatistics(
  dataset: StatisticsDataset,
  range: StatisticsPeriodRange,
  broker: StatisticsBroker,
  today: string,
  year: StatisticsYear,
): StatisticsSnapshot {
  const selected = intervalKpis(dataset, range, broker);
  const month = monthComparisonRanges(today, year);
  const currentMonth = intervalKpis(dataset, month.current, broker);
  const previousMonth = intervalKpis(dataset, month.previous, broker);
  const businessContacts = dataset.contacts.filter((contact) => matchesBroker(contact.broker, broker));
  const healthContacts = broker === "team" ? dataset.contacts : businessContacts;
  const periodContacts = businessContacts.filter((contact) => inRange(quebecDateKey(contact.createdAt), range));
  const transactionContactIds = new Set(dataset.transactionContacts
    .filter((link) => {
      const transaction = dataset.transactions.find((item) => item.id === link.transactionId);
      return Boolean(transaction && transaction.status !== "cancelled");
    })
    .map((link) => link.contactId));
  const provenanceTotal = periodContacts.length;
  const provenance = PROVENANCES.map((key) => {
    const contacts = periodContacts.filter((contact) => (contact.clientProvenance ?? "unreported") === key);
    const contactsWithTransaction = contacts.filter((contact) => transactionContactIds.has(contact.id)).length;
    return {
      key,
      label: key === "unreported" ? "Non renseigné" : CLIENT_PROVENANCE_LABELS[key],
      contacts: contacts.length,
      share: provenanceTotal === 0 ? 0 : Math.round((contacts.length / provenanceTotal) * 100),
      contactsWithTransaction,
      conversionRate: contacts.length === 0 ? 0 : Math.round((contactsWithTransaction / contacts.length) * 100),
    };
  });
  const linkedAccepted = validAcceptedOffers(dataset);
  const todayPlusSix = addDays(today, 6);
  const staleThreshold = addDays(today, -90);
  const brokerActivity = ASSIGNED_BROKERS
    .filter((item) => broker === "team" || broker === item)
    .map((item) => {
      const values = intervalKpis(dataset, range, item);
      return {
        broker: item,
        newContacts: values.newContacts,
        listingsTaken: dataset.listings.filter((listing) => listing.broker === item && listing.purpose === "sale" && inRange(listing.listingDate, range)).length,
        acceptedOffers: linkedAccepted.filter((offer) => {
          const listing = dataset.listings.find((candidate) => candidate.id === offer.listingId);
          return listing?.broker === item && inRange(offer.offerDate, range);
        }).length,
        saleTransactions: values.saleTransactions,
        purchaseTransactions: values.purchaseTransactions,
        saleVolume: values.saleVolume,
        purchaseVolume: values.purchaseVolume,
        followUps: dataset.contacts.filter((contact) => contact.broker === item && inRange(contact.nextFollowUpDate, range)).length,
      };
    });
  const currentMonthComparisons = Object.fromEntries(
    (Object.keys(currentMonth) as Array<keyof typeof currentMonth>).map((key) => [key, comparison(currentMonth[key], previousMonth[key])]),
  ) as StatisticsSnapshot["currentMonth"];
  return {
    broker,
    year,
    period: range,
    kpis: {
      ...selected,
      activeListings: year === parts(today)[0]
        ? dataset.listings.filter((listing) => matchesBroker(listing.broker, broker) && ACTIVE_LISTING_STATUSES.has(listing.status)).length
        : null,
    },
    monthContext: month.context,
    currentMonth: currentMonthComparisons,
    listingPerformance: listingPerformance(dataset, range, broker),
    provenance,
    brokerActivity,
    contactHealth: {
      totalContacts: healthContacts.length,
      unassigned: healthContacts.filter((contact) => contact.broker === "unassigned").length,
      hot: healthContacts.filter((contact) => contact.priority === "hot").length,
      warm: healthContacts.filter((contact) => contact.priority === "warm").length,
      cold: healthContacts.filter((contact) => contact.priority === "cold").length,
      followUpsThisWeek: healthContacts.filter((contact) => Boolean(contact.nextFollowUpDate && contact.nextFollowUpDate >= today && contact.nextFollowUpDate <= todayPlusSix)).length,
      overdueFollowUps: healthContacts.filter((contact) => Boolean(contact.nextFollowUpDate && contact.nextFollowUpDate < today)).length,
      neverContacted: healthContacts.filter((contact) => contact.lastContactDate === null).length,
      inactive90Days: healthContacts.filter((contact) => {
        const lastContact = contact.lastContactDate ? quebecDateKey(contact.lastContactDate) : null;
        return Boolean(lastContact && lastContact < staleThreshold);
      }).length,
    },
    trends: trendRanges(range).map((trend) => {
      const values = intervalKpis(dataset, trend, broker);
      return {
        month: trend.from.slice(0, 7),
        label: trend.label,
        listings: values.newListings,
        sales: values.saleTransactions,
        purchases: values.purchaseTransactions,
        saleVolume: values.saleVolume,
        purchaseVolume: values.purchaseVolume,
      };
    }),
    definitions: {
      purchaseBusinessDate: "Achats finalisés classés par date du notaire, ou par date de finalisation si elle est absente.",
      paDelay: "Première mise en marché → première offre acceptée reliée à une Transaction de vente.",
      saleDelay: "Première mise en marché → finalisation d’une Transaction de vente explicitement reliée au Listing.",
    },
  };
}
