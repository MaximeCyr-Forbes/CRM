import type {
  AutomaticEmailDelivery,
  AutomaticEmailDeliveryStatus,
  AutomaticEmailRule,
  AutomaticEmailRuleDraft,
  AutomaticEmailRuleRow,
} from "../../data/automatic-email-types";
import { mapAutomaticEmailRuleRow } from "../../data/automatic-email-types";
import type { CalendarBroker } from "../../data/calendar-types";
import { getSupabaseAdmin } from "../supabase/server";

const ruleColumns = "id, rule_type, name, status, execution_mode, default_broker, subject_template, body_template, send_hour, send_minute, timezone, trigger_config, created_at, updated_at";
const deliveryColumns = "id, rule_id, contact_id, transaction_id, broker, recipient_email, occurrence_key, scheduled_for, status, created_at, updated_at";

type DeliveryRow = {
  id: string;
  rule_id: string;
  contact_id: string | null;
  transaction_id: string | null;
  broker: CalendarBroker;
  recipient_email: string;
  occurrence_key: string;
  scheduled_for: string;
  status: AutomaticEmailDeliveryStatus;
  created_at: string;
  updated_at: string;
};

function rowValues(draft: AutomaticEmailRuleDraft) {
  return {
    rule_type: draft.ruleType,
    name: draft.name,
    status: draft.status,
    execution_mode: draft.executionMode,
    default_broker: draft.defaultBroker,
    subject_template: draft.subjectTemplate,
    body_template: draft.bodyTemplate,
    send_hour: draft.sendHour,
    send_minute: draft.sendMinute,
    timezone: draft.timezone,
    trigger_config: draft.triggerConfig,
  };
}

export async function listAutomaticEmailRules(): Promise<AutomaticEmailRule[]> {
  const { data, error } = await getSupabaseAdmin().from("automatic_email_rules").select(ruleColumns).order("created_at");
  if (error) throw error;
  return (data ?? []).map((row) => mapAutomaticEmailRuleRow(row as AutomaticEmailRuleRow));
}

export async function createAutomaticEmailRule(draft: AutomaticEmailRuleDraft) {
  const { data, error } = await getSupabaseAdmin().from("automatic_email_rules").insert(rowValues(draft)).select(ruleColumns).single();
  if (error) throw error;
  return mapAutomaticEmailRuleRow(data as AutomaticEmailRuleRow);
}

export async function updateAutomaticEmailRule(ruleId: string, draft: AutomaticEmailRuleDraft) {
  const { data, error } = await getSupabaseAdmin().from("automatic_email_rules").update(rowValues(draft)).eq("id", ruleId).select(ruleColumns).maybeSingle();
  if (error) throw error;
  return data ? mapAutomaticEmailRuleRow(data as AutomaticEmailRuleRow) : null;
}

export async function listAutomaticEmailDeliveries(): Promise<AutomaticEmailDelivery[]> {
  const { data, error } = await getSupabaseAdmin().from("automatic_email_deliveries").select(deliveryColumns).order("scheduled_for", { ascending: false }).limit(100);
  if (error) throw error;
  return ((data ?? []) as DeliveryRow[]).map((row) => ({
    id: row.id, ruleId: row.rule_id, contactId: row.contact_id, transactionId: row.transaction_id,
    broker: row.broker, recipientEmail: row.recipient_email, occurrenceKey: row.occurrence_key,
    scheduledFor: row.scheduled_for, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}
