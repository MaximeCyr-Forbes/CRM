import type {
  ListingActivityEntry,
  ListingActivityEventType,
  ListingBroker,
  ListingInterestLevel,
  ListingMarketingTask,
  ListingPriceHistoryEntry,
  ListingPurpose,
  ListingTrackingData,
  ListingVisit,
  ListingVisitDraft,
} from "../../data/listing-types";
import { getSupabaseAdmin } from "../supabase/server";
import { ListingServiceError } from "./persistence";

export type MarketingTaskRow = {
  id: string; listing_id: string; title: string; task_key: string | null;
  completed: boolean; completed_at: string | null; completed_by: ListingBroker | null;
  sort_order: number; is_custom: boolean; created_at: string; updated_at: string;
};

export type VisitRow = {
  id: string; listing_id: string; visit_date: string; visit_time: string | null;
  visiting_broker_name: string; visiting_broker_agency: string; buyer_names: string;
  feedback: string; interest_level: ListingInterestLevel | null; created_by: ListingBroker | null;
  created_at: string; updated_at: string;
};

export type ActivityRow = {
  id: string; listing_id: string; event_type: ListingActivityEventType; title: string;
  detail: string; actor_broker: ListingBroker | null; metadata: Record<string, unknown>; created_at: string;
};

export type PriceHistoryRow = {
  id: string; listing_id: string; purpose: ListingPurpose; amount: number | string | null;
  changed_by: ListingBroker | null; changed_at: string;
};

export type ListingTrackingRepository = {
  loadTasks: (listingId: string) => Promise<MarketingTaskRow[]>;
  loadVisits: (listingId: string) => Promise<VisitRow[]>;
  loadActivity: (listingId: string) => Promise<ActivityRow[]>;
  loadPriceHistory: (listingId: string) => Promise<PriceHistoryRow[]>;
  toggleTask: (listingId: string, taskId: string, completed: boolean, actor: ListingBroker | null) => Promise<MarketingTaskRow>;
  addTask: (listingId: string, title: string, actor: ListingBroker | null) => Promise<MarketingTaskRow>;
  updateTask: (listingId: string, taskId: string, title: string, actor: ListingBroker | null) => Promise<MarketingTaskRow>;
  deleteTask: (listingId: string, taskId: string, actor: ListingBroker | null) => Promise<void>;
  addVisit: (listingId: string, visit: ListingVisitDraft, actor: ListingBroker | null) => Promise<VisitRow>;
  updateVisit: (listingId: string, visitId: string, visit: ListingVisitDraft, actor: ListingBroker | null) => Promise<VisitRow>;
  deleteVisit: (listingId: string, visitId: string, actor: ListingBroker | null) => Promise<void>;
};

export function mapMarketingTask(row: MarketingTaskRow): ListingMarketingTask {
  return {
    id: row.id, listingId: row.listing_id, title: row.title, taskKey: row.task_key,
    completed: row.completed, completedAt: row.completed_at, completedBy: row.completed_by,
    sortOrder: row.sort_order, isCustom: row.is_custom, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function mapVisit(row: VisitRow): ListingVisit {
  return {
    id: row.id, listingId: row.listing_id, visitDate: row.visit_date,
    visitTime: row.visit_time ? row.visit_time.slice(0, 5) : null,
    visitingBrokerName: row.visiting_broker_name, visitingBrokerAgency: row.visiting_broker_agency,
    buyerNames: row.buyer_names, feedback: row.feedback, interestLevel: row.interest_level,
    createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function mapActivity(row: ActivityRow): ListingActivityEntry {
  return {
    id: row.id, listingId: row.listing_id, eventType: row.event_type, title: row.title,
    detail: row.detail, actorBroker: row.actor_broker, metadata: row.metadata ?? {}, createdAt: row.created_at,
  };
}

export function mapPriceHistory(row: PriceHistoryRow): ListingPriceHistoryEntry {
  return {
    id: row.id, listingId: row.listing_id, purpose: row.purpose,
    amount: row.amount === null ? null : Number(row.amount), changedBy: row.changed_by, changedAt: row.changed_at,
  };
}

const interestLevels = new Set<ListingInterestLevel>(["low", "medium", "high"]);

export function parseVisitDraft(value: unknown): ListingVisitDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const textFields = ["visitDate", "visitingBrokerName", "visitingBrokerAgency", "buyerNames", "feedback"] as const;
  if (!textFields.every((field) => typeof data[field] === "string")) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.visitDate as string)) return null;
  if (data.visitTime !== null && (typeof data.visitTime !== "string" || !/^\d{2}:\d{2}$/.test(data.visitTime))) return null;
  if (data.interestLevel !== null && !interestLevels.has(data.interestLevel as ListingInterestLevel)) return null;
  return {
    visitDate: data.visitDate as string,
    visitTime: data.visitTime as string | null,
    visitingBrokerName: (data.visitingBrokerName as string).trim(),
    visitingBrokerAgency: (data.visitingBrokerAgency as string).trim(),
    buyerNames: (data.buyerNames as string).trim(), feedback: (data.feedback as string).trim(),
    interestLevel: data.interestLevel as ListingInterestLevel | null,
  };
}

function rpcRow<T>(data: unknown, message: string) {
  const row = (Array.isArray(data) ? data[0] : data) as T | null;
  if (!row) throw new ListingServiceError("not_found", message);
  return row;
}

export function createSupabaseListingTrackingRepository(): ListingTrackingRepository {
  const queryRows = async <T,>(table: string, listingId: string, order: { column: string; ascending: boolean }[]) => {
    let query = getSupabaseAdmin().from(table).select("*").eq("listing_id", listingId);
    for (const item of order) query = query.order(item.column, { ascending: item.ascending });
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as T[];
  };
  const rpc = async <T,>(name: string, args: Record<string, unknown>, notFound: string) => {
    const { data, error } = await getSupabaseAdmin().rpc(name, args);
    if (error) throw error;
    return rpcRow<T>(data, notFound);
  };
  return {
    loadTasks: (listingId) => queryRows("listing_marketing_tasks", listingId, [{ column: "sort_order", ascending: true }, { column: "created_at", ascending: true }]),
    loadVisits: (listingId) => queryRows("listing_visits", listingId, [{ column: "visit_date", ascending: false }, { column: "visit_time", ascending: false }]),
    loadActivity: (listingId) => queryRows("listing_activity", listingId, [{ column: "created_at", ascending: false }]),
    loadPriceHistory: (listingId) => queryRows("listing_price_history", listingId, [{ column: "changed_at", ascending: false }]),
    toggleTask: (listingId, taskId, completed, actor) => rpc("set_listing_marketing_task_completion", { p_listing_id: listingId, p_task_id: taskId, p_completed: completed, p_actor: actor }, "Tâche introuvable."),
    addTask: (listingId, title, actor) => rpc("create_custom_listing_marketing_task", { p_listing_id: listingId, p_title: title, p_actor: actor }, "Tâche introuvable."),
    updateTask: (listingId, taskId, title, actor) => rpc("update_custom_listing_marketing_task", { p_listing_id: listingId, p_task_id: taskId, p_title: title, p_actor: actor }, "Tâche introuvable."),
    async deleteTask(listingId, taskId, actor) { await rpc("delete_custom_listing_marketing_task", { p_listing_id: listingId, p_task_id: taskId, p_actor: actor }, "Tâche introuvable."); },
    addVisit: (listingId, visit, actor) => rpc("create_listing_visit", { p_listing_id: listingId, p_values: visit, p_actor: actor }, "Visite introuvable."),
    updateVisit: (listingId, visitId, visit, actor) => rpc("update_listing_visit", { p_listing_id: listingId, p_visit_id: visitId, p_values: visit, p_actor: actor }, "Visite introuvable."),
    async deleteVisit(listingId, visitId, actor) { await rpc("delete_listing_visit", { p_listing_id: listingId, p_visit_id: visitId, p_actor: actor }, "Visite introuvable."); },
  };
}

export function createListingTrackingService(repository: ListingTrackingRepository) {
  const title = (value: string) => {
    const normalized = value.trim();
    if (!normalized || normalized.length > 240) throw new ListingServiceError("invalid_listing", "Titre de tâche invalide.");
    return normalized;
  };
  return {
    async getTracking(listingId: string): Promise<ListingTrackingData> {
      const [tasks, visits, activity, priceHistory] = await Promise.all([
        repository.loadTasks(listingId), repository.loadVisits(listingId),
        repository.loadActivity(listingId), repository.loadPriceHistory(listingId),
      ]);
      return {
        tasks: tasks.map(mapMarketingTask), visits: visits.map(mapVisit),
        activity: activity.map(mapActivity), priceHistory: priceHistory.map(mapPriceHistory),
      };
    },
    async toggleTask(listingId: string, taskId: string, completed: boolean, actor: ListingBroker | null) {
      return mapMarketingTask(await repository.toggleTask(listingId, taskId, completed, actor));
    },
    async addTask(listingId: string, value: string, actor: ListingBroker | null) {
      return mapMarketingTask(await repository.addTask(listingId, title(value), actor));
    },
    async updateTask(listingId: string, taskId: string, value: string, actor: ListingBroker | null) {
      return mapMarketingTask(await repository.updateTask(listingId, taskId, title(value), actor));
    },
    deleteTask: (listingId: string, taskId: string, actor: ListingBroker | null) => repository.deleteTask(listingId, taskId, actor),
    async addVisit(listingId: string, input: unknown, actor: ListingBroker | null) {
      const visit = parseVisitDraft(input);
      if (!visit) throw new ListingServiceError("invalid_listing", "Visite invalide.");
      return mapVisit(await repository.addVisit(listingId, visit, actor));
    },
    async updateVisit(listingId: string, visitId: string, input: unknown, actor: ListingBroker | null) {
      const visit = parseVisitDraft(input);
      if (!visit) throw new ListingServiceError("invalid_listing", "Visite invalide.");
      return mapVisit(await repository.updateVisit(listingId, visitId, visit, actor));
    },
    deleteVisit: (listingId: string, visitId: string, actor: ListingBroker | null) => repository.deleteVisit(listingId, visitId, actor),
  };
}

const trackingService = createListingTrackingService(createSupabaseListingTrackingRepository());
export const getListingTracking = (listingId: string) => trackingService.getTracking(listingId);
export const toggleListingTask = (listingId: string, taskId: string, completed: boolean, actor: ListingBroker | null) => trackingService.toggleTask(listingId, taskId, completed, actor);
export const addListingTask = (listingId: string, title: string, actor: ListingBroker | null) => trackingService.addTask(listingId, title, actor);
export const updateListingTask = (listingId: string, taskId: string, title: string, actor: ListingBroker | null) => trackingService.updateTask(listingId, taskId, title, actor);
export const deleteListingTask = (listingId: string, taskId: string, actor: ListingBroker | null) => trackingService.deleteTask(listingId, taskId, actor);
export const addListingVisit = (listingId: string, visit: unknown, actor: ListingBroker | null) => trackingService.addVisit(listingId, visit, actor);
export const updateListingVisit = (listingId: string, visitId: string, visit: unknown, actor: ListingBroker | null) => trackingService.updateVisit(listingId, visitId, visit, actor);
export const deleteListingVisit = (listingId: string, visitId: string, actor: ListingBroker | null) => trackingService.deleteVisit(listingId, visitId, actor);
