import type { CalendarSyncStatus, ContactBroker } from "./contact-types";
import { compareTransactionDeadlines } from "../lib/transactions/deadline-time";

export const PURCHASE_TRANSACTION_STATUSES = [
  "new",
  "pa_preparation",
  "pa_sent",
  "pa_accepted",
  "inspection",
  "financing",
  "other_conditions",
  "conditions_met",
  "notary",
  "completed",
  "cancelled",
] as const;

export const SALE_TRANSACTION_STATUSES = [
  "new",
  "on_market",
  "offer_received",
  "negotiation",
  "pa_accepted",
  "inspection",
  "financing",
  "other_conditions",
  "conditions_met",
  "notary",
  "completed",
  "cancelled",
] as const;

export type TransactionType = "purchase" | "sale";
export type PurchaseTransactionStatus = (typeof PURCHASE_TRANSACTION_STATUSES)[number];
export type SaleTransactionStatus = (typeof SALE_TRANSACTION_STATUSES)[number];
export type TransactionStatus = PurchaseTransactionStatus | SaleTransactionStatus;
export type TransactionBroker = Exclude<ContactBroker, "unassigned">;

export type TransactionDeadline = {
  id: string;
  transactionId: string;
  title: string;
  dueDate: string;
  dueTime: string | null;
  completed: boolean;
  googleCalendarEventId: string | null;
  googleCalendarEventBroker: TransactionBroker | null;
  googleCalendarSyncStatus: CalendarSyncStatus;
  googleCalendarLastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TransactionNote = {
  id: string;
  transactionId: string;
  content: string;
  createdAt: string;
};

export type Transaction = {
  id: string;
  address: string;
  centrisNumber: string;
  type: TransactionType;
  broker: TransactionBroker;
  contactIds: string[];
  price: number | null;
  soldPrice: number | null;
  promiseDate: string | null;
  notaryDate: string | null;
  collaboratingBrokerName: string;
  saleFinalizedAt: string | null;
  purchaseFinalizedAt: string | null;
  status: TransactionStatus;
  generalNotes: string;
  deadlines: TransactionDeadline[];
  notes: TransactionNote[];
  sourceListing: {
    listingId: string;
    offerId: string;
    address: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type TransactionSaleCompletion = {
  soldPrice: number;
  notaryDate: string;
  collaboratingBrokerName: string;
  noCollaboratingBroker: boolean;
};

export type TransactionPurchaseCompletion = {
  purchasePrice: number;
  notaryDate: string;
  collaboratingBrokerName: string;
  noCollaboratingBroker: boolean;
};

export type TransactionDraft = Pick<
  Transaction,
  "address" | "centrisNumber" | "type" | "broker" | "contactIds" | "price" | "promiseDate" | "status" | "generalNotes"
>;

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  purchase: "Achat",
  sale: "Vente",
};

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  new: "Nouveau",
  pa_preparation: "PA en préparation",
  pa_sent: "PA envoyée",
  pa_accepted: "PA acceptée",
  inspection: "Inspection",
  financing: "Financement",
  other_conditions: "Autres conditions",
  conditions_met: "Conditions réalisées",
  notary: "Notaire",
  completed: "Terminée",
  cancelled: "Annulée",
  on_market: "En marché",
  offer_received: "Offre reçue",
  negotiation: "Négociation",
};

export const DEADLINE_PRESETS = [
  "Inspection",
  "Financement",
  "Autres conditions",
  "Signature chez le notaire",
] as const;

export function isTransactionCompleted(
  transaction: Pick<Transaction, "status" | "type" | "saleFinalizedAt" | "purchaseFinalizedAt">,
) {
  return transaction.status === "completed"
    || transaction.status === "cancelled"
    || (transaction.type === "sale" ? transaction.saleFinalizedAt !== null : transaction.purchaseFinalizedAt !== null);
}

export function getNextTransactionDeadline(transaction: Pick<Transaction, "deadlines">) {
  return [...transaction.deadlines]
    .filter((deadline) => !deadline.completed)
    .sort(compareTransactionDeadlines)[0] ?? null;
}

export function statusesForTransaction(type: TransactionType) {
  return type === "purchase" ? PURCHASE_TRANSACTION_STATUSES : SALE_TRANSACTION_STATUSES;
}

export function validStatusForTransaction(type: TransactionType, status: TransactionStatus): TransactionStatus {
  return statusesForTransaction(type).includes(status as never) ? status : "new";
}
