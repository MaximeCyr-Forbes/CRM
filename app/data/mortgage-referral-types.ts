import type { TransactionBroker } from "./transaction-types";

export type ReferralTransaction = {
  id: string;
  address: string;
  centris_number: string;
  broker: TransactionBroker;
  transaction_contacts: { contacts: { id: string; first_name: string; last_name: string } | null }[];
};
export type MortgageReferral = {
  id: string;
  broker: TransactionBroker;
  transaction_id: string;
  mortgage_advisor_name: string;
  institution_name: string;
  follow_up_at: string | null;
  follow_up_note: string;
  google_event_id: string | null;
  google_calendar_id: string | null;
  google_event_link: string | null;
  created_at: string;
  updated_at: string;
  transactions: ReferralTransaction;
};
export function referralContactName(contact: { first_name: string; last_name: string }) {
  return `${contact.first_name} ${contact.last_name}`.trim();
}
export function referralMatchesSearch(referral: MortgageReferral, query: string) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalize([referral.transactions.address, referral.mortgage_advisor_name, referral.institution_name,
    ...referral.transactions.transaction_contacts.flatMap(({ contacts }) => contacts ? [referralContactName(contacts)] : [])].join(" "))
    .includes(normalize(query.trim()));
}
