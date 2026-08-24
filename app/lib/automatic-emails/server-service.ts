import type { CalendarConnectionStatus } from "../../data/calendar-types";
import type { ContactBroker } from "../../data/contact-types";
import type { AutomaticEmailRule } from "../../data/automatic-email-types";
import { listGoogleConnectionStatuses } from "../google-calendar/service";
import { getSupabaseAdmin } from "../supabase/server";
import {
  calculateAutomaticEmailOccurrences,
  occurrenceSummary,
  type AutomaticEmailContact,
  type AutomaticEmailPreviewDataset,
  type AutomaticEmailTransaction,
  type AutomaticEmailTransactionContact,
} from "./calculations";
import { listAutomaticEmailRules } from "./persistence";

const PAGE_SIZE = 1000;

type ContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  broker: ContactBroker;
  birth_date: string | null;
  mortgage_renewal_date: string | null;
};
type TransactionRow = {
  id: string;
  type: "purchase" | "sale";
  status: string;
  notary_date: string | null;
  sale_finalized_at: string | null;
  purchase_finalized_at: string | null;
};
type TransactionContactRow = { transaction_id: string; contact_id: string };

async function listRows<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await getSupabaseAdmin().from(table).select(columns).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function loadAutomaticEmailPreviewDataset(): Promise<AutomaticEmailPreviewDataset> {
  const [contacts, transactions, transactionContacts, connections] = await Promise.all([
    listRows<ContactRow>("contacts", "id, first_name, last_name, email, broker, birth_date, mortgage_renewal_date"),
    listRows<TransactionRow>("transactions", "id, type, status, notary_date, sale_finalized_at, purchase_finalized_at"),
    listRows<TransactionContactRow>("transaction_contacts", "transaction_id, contact_id"),
    listGoogleConnectionStatuses(),
  ]);
  return {
    contacts: contacts.map((row): AutomaticEmailContact => ({
      id: row.id, firstName: row.first_name, lastName: row.last_name, email: row.email, broker: row.broker,
      birthDate: row.birth_date, mortgageRenewalDate: row.mortgage_renewal_date,
    })),
    transactions: transactions.map((row): AutomaticEmailTransaction => ({
      id: row.id, type: row.type, status: row.status, notaryDate: row.notary_date, saleFinalizedAt: row.sale_finalized_at,
      purchaseFinalizedAt: row.purchase_finalized_at,
    })),
    transactionContacts: transactionContacts.map((row): AutomaticEmailTransactionContact => ({ transactionId: row.transaction_id, contactId: row.contact_id })),
    connections: connections as CalendarConnectionStatus[],
  };
}

export async function getAutomaticEmailOccurrences(input: { from: string; to: string; ruleId?: string | null; today: string }) {
  const [rules, dataset] = await Promise.all([listAutomaticEmailRules(), loadAutomaticEmailPreviewDataset()]);
  const selectedRules: AutomaticEmailRule[] = input.ruleId ? rules.filter((rule) => rule.id === input.ruleId) : rules;
  if (input.ruleId && selectedRules.length === 0) return null;
  const occurrences = calculateAutomaticEmailOccurrences(selectedRules, dataset, input.from, input.to);
  return { occurrences, summary: occurrenceSummary(occurrences, input.today) };
}
