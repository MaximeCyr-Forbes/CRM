import type { CalendarBroker } from "../../data/calendar-types";
import type { ContactBroker } from "../../data/contact-types";
import type {
  CustomEmailCampaign,
  CustomEmailCampaignContact,
  CustomEmailCampaignDraft,
  CustomEmailCampaignStep,
  CustomEmailCampaignStepDraft,
  CustomEmailCampaignStatus,
  CustomEmailExecutionMode,
  CustomEmailSenderStrategy,
} from "../../data/custom-email-campaign-types";
import { customCampaignDuration } from "./custom-campaign-calculations";
import { getSupabaseAdmin } from "../supabase/server";

const PAGE_SIZE = 1000;
const campaignColumns = "id, name, status, execution_mode, sender_strategy, fixed_broker, fallback_broker, start_date, send_hour, send_minute, timezone, created_at, updated_at";
const stepColumns = "id, campaign_id, step_order, delay_days_after_previous, subject_template, body_template, created_at, updated_at";

type CampaignRow = {
  id: string; name: string; status: CustomEmailCampaignStatus; execution_mode: CustomEmailExecutionMode;
  sender_strategy: CustomEmailSenderStrategy; fixed_broker: CalendarBroker | null; fallback_broker: CalendarBroker | null;
  start_date: string | null; send_hour: number; send_minute: number; timezone: "America/Toronto"; created_at: string; updated_at: string;
};
type StepRow = {
  id: string; campaign_id: string; step_order: number; delay_days_after_previous: number;
  subject_template: string; body_template: string; created_at: string; updated_at: string;
};
type CampaignContactRow = { campaign_id: string; contact_id: string };
type ContactRow = { id: string; first_name: string; last_name: string; email: string; phone: string; broker: ContactBroker };

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

function mapStep(row: StepRow): CustomEmailCampaignStep {
  return {
    id: row.id, campaignId: row.campaign_id, stepOrder: row.step_order,
    delayDaysAfterPrevious: row.delay_days_after_previous, subjectTemplate: row.subject_template,
    bodyTemplate: row.body_template, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapCampaign(row: CampaignRow, contactCount = 0, steps: readonly CustomEmailCampaignStep[] = []): CustomEmailCampaign {
  return {
    id: row.id, name: row.name, status: row.status, executionMode: row.execution_mode,
    senderStrategy: row.sender_strategy, fixedBroker: row.fixed_broker, fallbackBroker: row.fallback_broker,
    startDate: row.start_date, sendHour: row.send_hour, sendMinute: row.send_minute, timezone: row.timezone,
    contactCount, stepCount: steps.length, durationDays: customCampaignDuration(steps), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function campaignValues(draft: CustomEmailCampaignDraft) {
  return {
    name: draft.name, status: draft.status, execution_mode: draft.executionMode, sender_strategy: draft.senderStrategy,
    fixed_broker: draft.fixedBroker, fallback_broker: draft.fallbackBroker, start_date: draft.startDate,
    send_hour: draft.sendHour, send_minute: draft.sendMinute, timezone: draft.timezone,
  };
}

function stepValues(draft: CustomEmailCampaignStepDraft) {
  return { delay_days_after_previous: draft.delayDaysAfterPrevious, subject_template: draft.subjectTemplate, body_template: draft.bodyTemplate };
}

export async function listCustomEmailCampaigns(): Promise<CustomEmailCampaign[]> {
  const [campaignRows, contactRows, stepRows] = await Promise.all([
    listRows<CampaignRow>("custom_email_campaigns", campaignColumns),
    listRows<CampaignContactRow>("custom_email_campaign_contacts", "campaign_id, contact_id"),
    listRows<StepRow>("custom_email_campaign_steps", stepColumns),
  ]);
  return campaignRows.map((row) => {
    const steps = stepRows.filter((step) => step.campaign_id === row.id).map(mapStep);
    return mapCampaign(row, contactRows.filter((contact) => contact.campaign_id === row.id).length, steps);
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCustomEmailCampaign(campaignId: string) {
  const { data, error } = await getSupabaseAdmin().from("custom_email_campaigns").select(campaignColumns).eq("id", campaignId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [contacts, steps] = await Promise.all([listCustomEmailCampaignContacts(campaignId), listCustomEmailCampaignSteps(campaignId)]);
  return { campaign: mapCampaign(data as CampaignRow, contacts.length, steps), contacts, steps };
}

export async function createCustomEmailCampaign(draft: CustomEmailCampaignDraft) {
  const { data, error } = await getSupabaseAdmin().from("custom_email_campaigns").insert(campaignValues(draft)).select(campaignColumns).single();
  if (error) throw error;
  return mapCampaign(data as CampaignRow);
}

export async function updateCustomEmailCampaign(campaignId: string, draft: CustomEmailCampaignDraft) {
  const { data, error } = await getSupabaseAdmin().from("custom_email_campaigns").update(campaignValues(draft)).eq("id", campaignId).select(campaignColumns).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [contacts, steps] = await Promise.all([listCustomEmailCampaignContacts(campaignId), listCustomEmailCampaignSteps(campaignId)]);
  return mapCampaign(data as CampaignRow, contacts.length, steps);
}

export async function deleteCustomEmailCampaign(campaignId: string) {
  const { data, error } = await getSupabaseAdmin().from("custom_email_campaigns").delete().eq("id", campaignId).in("status", ["draft", "paused"]).select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function listCustomEmailCampaignSteps(campaignId: string): Promise<CustomEmailCampaignStep[]> {
  const { data, error } = await getSupabaseAdmin().from("custom_email_campaign_steps").select(stepColumns).eq("campaign_id", campaignId).order("step_order");
  if (error) throw error;
  return ((data ?? []) as StepRow[]).map(mapStep);
}

export async function createCustomEmailCampaignStep(campaignId: string, draft: CustomEmailCampaignStepDraft) {
  const steps = await listCustomEmailCampaignSteps(campaignId);
  const values = stepValues(draft);
  if (steps.length === 0) values.delay_days_after_previous = 0;
  const { data, error } = await getSupabaseAdmin().from("custom_email_campaign_steps").insert({ campaign_id: campaignId, step_order: steps.length + 1, ...values }).select(stepColumns).single();
  if (error) throw error;
  return mapStep(data as StepRow);
}

export async function updateCustomEmailCampaignStep(campaignId: string, stepId: string, draft: CustomEmailCampaignStepDraft) {
  const current = (await listCustomEmailCampaignSteps(campaignId)).find((step) => step.id === stepId);
  if (!current) return null;
  const values = stepValues(draft);
  if (current.stepOrder === 1) values.delay_days_after_previous = 0;
  const { data, error } = await getSupabaseAdmin().from("custom_email_campaign_steps").update(values).eq("campaign_id", campaignId).eq("id", stepId).select(stepColumns).maybeSingle();
  if (error) throw error;
  return data ? mapStep(data as StepRow) : null;
}

export async function deleteCustomEmailCampaignStep(campaignId: string, stepId: string) {
  const { data, error } = await getSupabaseAdmin().from("custom_email_campaign_steps").delete().eq("campaign_id", campaignId).eq("id", stepId).select("id").maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const remaining = await listCustomEmailCampaignSteps(campaignId);
  await reorderCustomEmailCampaignSteps(campaignId, remaining.map((step) => step.id));
  return true;
}

export async function reorderCustomEmailCampaignSteps(campaignId: string, stepIds: readonly string[]) {
  const current = await listCustomEmailCampaignSteps(campaignId);
  if (current.length !== stepIds.length || current.some((step) => !stepIds.includes(step.id))) return null;
  const admin = getSupabaseAdmin();
  for (let index = 0; index < stepIds.length; index += 1) {
    const { error } = await admin.from("custom_email_campaign_steps").update({ step_order: 100_000 + index }).eq("campaign_id", campaignId).eq("id", stepIds[index]);
    if (error) throw error;
  }
  for (let index = 0; index < stepIds.length; index += 1) {
    const { error } = await admin.from("custom_email_campaign_steps").update({ step_order: index + 1 }).eq("campaign_id", campaignId).eq("id", stepIds[index]);
    if (error) throw error;
  }
  if (stepIds[0]) {
    const { error } = await admin.from("custom_email_campaign_steps").update({ delay_days_after_previous: 0 }).eq("campaign_id", campaignId).eq("id", stepIds[0]);
    if (error) throw error;
  }
  return listCustomEmailCampaignSteps(campaignId);
}

export async function listCustomEmailCampaignContacts(campaignId: string): Promise<CustomEmailCampaignContact[]> {
  const { data: links, error: linkError } = await getSupabaseAdmin().from("custom_email_campaign_contacts").select("contact_id").eq("campaign_id", campaignId);
  if (linkError) throw linkError;
  const ids = (links ?? []).map((row) => String(row.contact_id));
  if (ids.length === 0) return [];
  const contacts: ContactRow[] = [];
  for (let index = 0; index < ids.length; index += 150) {
    const { data, error } = await getSupabaseAdmin().from("contacts").select("id, first_name, last_name, email, phone, broker").in("id", ids.slice(index, index + 150));
    if (error) throw error;
    contacts.push(...(data ?? []) as ContactRow[]);
  }
  const byId = new Map(contacts.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [{ id: row.id, firstName: row.first_name, lastName: row.last_name, email: row.email, phone: row.phone, broker: row.broker, selected: true }] : [];
  });
}

export async function listCustomEmailSelectableContacts(campaignId: string): Promise<CustomEmailCampaignContact[]> {
  const [rows, selected] = await Promise.all([
    listRows<ContactRow>("contacts", "id, first_name, last_name, email, phone, broker"),
    listRows<CampaignContactRow>("custom_email_campaign_contacts", "campaign_id, contact_id"),
  ]);
  const selectedIds = new Set(selected.filter((link) => link.campaign_id === campaignId).map((link) => link.contact_id));
  return rows.map((row) => ({ id: row.id, firstName: row.first_name, lastName: row.last_name, email: row.email, phone: row.phone, broker: row.broker, selected: selectedIds.has(row.id) }))
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "fr"));
}

export async function replaceCustomEmailCampaignContacts(campaignId: string, contactIds: readonly string[]) {
  const admin = getSupabaseAdmin();
  const { data: currentRows, error: currentError } = await admin.from("custom_email_campaign_contacts").select("contact_id").eq("campaign_id", campaignId);
  if (currentError) throw currentError;
  const current = new Set((currentRows ?? []).map((row) => String(row.contact_id)));
  const wanted = new Set(contactIds);
  const removals = [...current].filter((id) => !wanted.has(id));
  const additions = [...wanted].filter((id) => !current.has(id));
  if (removals.length > 0) {
    const { error } = await admin.from("custom_email_campaign_contacts").delete().eq("campaign_id", campaignId).in("contact_id", removals);
    if (error) throw error;
  }
  for (let index = 0; index < additions.length; index += 500) {
    const { error } = await admin.from("custom_email_campaign_contacts").insert(additions.slice(index, index + 500).map((contactId) => ({ campaign_id: campaignId, contact_id: contactId })));
    if (error) throw error;
  }
  return listCustomEmailSelectableContacts(campaignId);
}
