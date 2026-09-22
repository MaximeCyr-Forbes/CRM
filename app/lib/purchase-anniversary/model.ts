import { birthdayMatchesDate } from "../dashboard/daily-notifications";
import type { BirthdayGreeting } from "../birthday-greetings/model";
export type PurchaseGreeting = BirthdayGreeting & { transaction_id: string };
export type PurchaseTransaction = { id: string; type: string; address: string; notary_date: string | null; purchase_finalized_at: string | null };
export function isPurchaseAnniversary(transaction: PurchaseTransaction, today: string) {
  return transaction.type === "purchase" && Boolean(transaction.purchase_finalized_at && transaction.notary_date
    && transaction.notary_date.slice(0, 4) < today.slice(0, 4) && birthdayMatchesDate(transaction.notary_date, today));
}
export function purchaseDateLabel(date: string) {
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
