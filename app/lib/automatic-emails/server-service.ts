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
  address: string;
  status: string;
  notary_date: string | null;
  sale_finalized_at: string | null;
  purchase_finalized_at: string | null;
};
type TransactionContactRow = { transaction_id: string; contact_id: string };

async function listRows<T>(table: string, columns: string, ids?: { column: string; values: string[] }): Promise<T[]> {
  if (ids && !ids.values.length) return [];
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = getSupabaseAdmin().from(table).select(columns).order(table === "transaction_contacts" ? "transaction_id" : "id");
    if (ids) query = query.in(ids.column, ids.values);
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function loadAutomaticEmailPreviewDataset(rules?: readonly AutomaticEmailRule[]): Promise<AutomaticEmailPreviewDataset> {
  const needsTransactions = !rules || rules.some(r => r.ruleType === "purchase_anniversary" || r.ruleType === "google_review");
  const [contacts, allTransactions, connections] = await Promise.all([
    listRows<ContactRow>("contacts", "id, first_name, last_name, email, broker, birth_date, mortgage_renewal_date"),
    needsTransactions ? listRows<TransactionRow>("transactions", "id, type, address, status, notary_date, sale_finalized_at, purchase_finalized_at") : Promise.resolve([]),
    listGoogleConnectionStatuses(),
  ]);
  const transactions = allTransactions.filter(t => t.type === "purchase" ? Boolean(t.purchase_finalized_at && t.notary_date) : Boolean(t.sale_finalized_at && (!rules || rules.some(r => r.ruleType === "google_review"))));
  const transactionContacts: TransactionContactRow[] = [];
  for (let offset = 0; offset < transactions.length; offset += 100) {
    transactionContacts.push(...await listRows<TransactionContactRow>("transaction_contacts", "transaction_id, contact_id", { column: "transaction_id", values: transactions.slice(offset, offset + 100).map(t => t.id) }));
  }
  return {
    contacts: contacts.map((row): AutomaticEmailContact => ({
      id: row.id, firstName: row.first_name, lastName: row.last_name, email: row.email, broker: row.broker,
      birthDate: row.birth_date, mortgageRenewalDate: row.mortgage_renewal_date,
    })),
    transactions: transactions.map((row): AutomaticEmailTransaction => ({
      id: row.id, type: row.type, address: row.address, status: row.status, notaryDate: row.notary_date, saleFinalizedAt: row.sale_finalized_at,
      purchaseFinalizedAt: row.purchase_finalized_at,
    })),
    transactionContacts: transactionContacts.map((row): AutomaticEmailTransactionContact => ({ transactionId: row.transaction_id, contactId: row.contact_id })),
    connections: connections as CalendarConnectionStatus[],
  };
}

export async function getAutomaticEmailOccurrences(input: { from: string; to: string; ruleId?: string | null; today: string; mode?: string | null }) {
  const rules = await listAutomaticEmailRules();
  const selectedRules: AutomaticEmailRule[] = input.ruleId ? rules.filter((rule) => rule.id === input.ruleId) : rules;
  if (input.ruleId && selectedRules.length === 0) return null;
  const dataset = await loadAutomaticEmailPreviewDataset(selectedRules);
  const occurrences = calculateAutomaticEmailOccurrences(selectedRules, dataset, input.from, input.to);
  if (input.mode === "summary") return { summary: occurrenceSummary(occurrences, input.today), rules: selectedRules.map(rule => {
    const items = occurrences.filter(o => o.ruleId === rule.id);
    return { ruleId: rule.id, count30Days: items.length, nextDate: items[0]?.scheduledDate ?? null, nextTime: items[0]?.scheduledTime ?? null };
  }) };
  if (input.mode === "preview") return { occurrences: occurrences.slice(0, 1) };
  return { occurrences, summary: occurrenceSummary(occurrences, input.today) };
}
