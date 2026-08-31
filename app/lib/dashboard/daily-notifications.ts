import { BROKER_LABELS, getContactName, type Contact, type ContactBroker } from "../../data/contact-types";
import type { Listing } from "../../data/listing-types";
import { formatRecommendationDate, type CRMRecommendation } from "../../data/recommendation-types";
import { isTransactionCompleted, type Transaction } from "../../data/transaction-types";
import { listingAddressLines } from "../listings/presentation";

export type DailyNotificationType =
  | "recommendation"
  | "mortgage_renewal"
  | "transaction_deadline"
  | "listing_expiration"
  | "follow_up"
  | "birthday";

export type DailyNotification = {
  id: string;
  type: DailyNotificationType;
  title: string;
  detail: string;
  secondaryDetail?: string;
  href: string;
  priority: number;
  entityId: string;
};

export const DAILY_NOTIFICATION_PRIORITIES: Record<DailyNotificationType, number> = {
  recommendation: 5,
  mortgage_renewal: 10,
  transaction_deadline: 20,
  listing_expiration: 30,
  follow_up: 40,
  birthday: 50,
};

const CLOSED_LISTING_STATUSES = new Set<Listing["status"]>(["sold", "rented", "expired", "withdrawn"]);

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function birthdayMatchesDate(birthDate: string, today: string) {
  const birthMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  const todayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!birthMatch || !todayMatch) return false;
  const todayYear = Number(todayMatch[1]);
  const birthMonth = Number(birthMatch[2]);
  const birthDay = Number(birthMatch[3]);
  const observedDay = birthMonth === 2 && birthDay === 29 && !isLeapYear(todayYear) ? 28 : birthDay;
  return Number(todayMatch[2]) === birthMonth && Number(todayMatch[3]) === observedDay;
}

function deduplicateAndSort(notifications: DailyNotification[]) {
  return [...new Map(notifications.map((notification) => [notification.id, notification])).values()]
    .sort((first, second) =>
      first.priority - second.priority
      || first.title.localeCompare(second.title, "fr")
      || first.id.localeCompare(second.id, "fr"),
    );
}

export function recommendationNotifications(
  recommendations: ReadonlyArray<CRMRecommendation>,
  broker: Exclude<ContactBroker, "unassigned">,
) {
  if (broker !== "maxime") return [];
  return recommendations
    .filter((recommendation) => recommendation.status === "unread" && !recommendation.isCompleted)
    .map((recommendation): DailyNotification => ({
      id: `recommendation:${recommendation.id}`,
      type: "recommendation",
      title: recommendation.title,
      detail: `Envoyée par ${BROKER_LABELS[recommendation.submittedBy]}`,
      secondaryDetail: `Reçue le ${formatRecommendationDate(recommendation.createdAt)}`,
      href: `/settings?recommendation=${encodeURIComponent(recommendation.id)}`,
      priority: DAILY_NOTIFICATION_PRIORITIES.recommendation,
      entityId: recommendation.id,
    }));
}

export function getDailyNotifications({
  contacts,
  transactions,
  listings,
  recommendations = [],
  broker,
  today,
}: {
  contacts: ReadonlyArray<Contact>;
  transactions: ReadonlyArray<Transaction>;
  listings: ReadonlyArray<Listing>;
  recommendations?: ReadonlyArray<CRMRecommendation>;
  broker: Exclude<ContactBroker, "unassigned">;
  today: string;
}) {
  const notifications: DailyNotification[] = recommendationNotifications(recommendations, broker);

  for (const contact of contacts) {
    const name = getContactName(contact);
    if (contact.mortgageRenewalDate === today) {
      notifications.push({
        id: `mortgage:${contact.id}`,
        type: "mortgage_renewal",
        title: name,
        detail: "Renouvellement hypothécaire aujourd’hui",
        href: `/contacts/${contact.id}`,
        priority: DAILY_NOTIFICATION_PRIORITIES.mortgage_renewal,
        entityId: contact.id,
      });
    }
    if (contact.nextFollowUpDate === today && contact.broker === broker) {
      notifications.push({
        id: `followup:${contact.id}`,
        type: "follow_up",
        title: name,
        detail: "Suivi prévu aujourd’hui",
        href: `/contacts/${contact.id}?mode=followups`,
        priority: DAILY_NOTIFICATION_PRIORITIES.follow_up,
        entityId: contact.id,
      });
    }
    if (birthdayMatchesDate(contact.birthDate, today)) {
      notifications.push({
        id: `birthday:${contact.id}`,
        type: "birthday",
        title: name,
        detail: "Anniversaire aujourd’hui",
        href: `/contacts/${contact.id}`,
        priority: DAILY_NOTIFICATION_PRIORITIES.birthday,
        entityId: contact.id,
      });
    }
  }

  for (const transaction of transactions) {
    if (transaction.broker !== broker || isTransactionCompleted(transaction)) continue;
    for (const deadline of transaction.deadlines) {
      if (deadline.dueDate !== today || deadline.completed) continue;
      notifications.push({
        id: `transaction-deadline:${deadline.id}`,
        type: "transaction_deadline",
        title: deadline.title,
        detail: transaction.address,
        secondaryDetail: "Échéance prévue aujourd’hui",
        href: `/transactions/${transaction.id}`,
        priority: DAILY_NOTIFICATION_PRIORITIES.transaction_deadline,
        entityId: transaction.id,
      });
    }
  }

  for (const listing of listings) {
    if (
      listing.broker !== broker
      || listing.expirationDate !== today
      || CLOSED_LISTING_STATUSES.has(listing.status)
    ) continue;
    notifications.push({
      id: `listing-expiration:${listing.id}`,
      type: "listing_expiration",
      title: listingAddressLines(listing)[0] ?? "Adresse à confirmer",
      detail: "Contrat de courtage expire aujourd’hui",
      href: `/listings/${listing.id}`,
      priority: DAILY_NOTIFICATION_PRIORITIES.listing_expiration,
      entityId: listing.id,
    });
  }

  return deduplicateAndSort(notifications);
}
