import { describe, expect, it } from "vitest";
import type { ListingBroker, ListingVisitDraft } from "../../data/listing-types";
import {
  createListingTrackingService,
  parseVisitDraft,
  type ActivityRow,
  type ListingTrackingRepository,
  type MarketingTaskRow,
  type PriceHistoryRow,
  type VisitRow,
} from "./tracking";

const listingId = "10000000-0000-4000-8000-000000000001";
const now = "2026-08-19T20:00:00.000Z";

class MemoryTrackingRepository implements ListingTrackingRepository {
  tasks: MarketingTaskRow[] = Array.from({ length: 9 }, (_, index) => ({
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    listing_id: listingId, title: `Tâche ${index + 1}`, task_key: `task_${index + 1}`,
    completed: false, completed_at: null, completed_by: null, sort_order: (index + 1) * 10,
    is_custom: false, created_at: now, updated_at: now,
  }));
  visits: VisitRow[] = [];
  activity: ActivityRow[] = [];
  prices: PriceHistoryRow[] = [{ id: "30000000-0000-4000-8000-000000000001", listing_id: listingId, purpose: "sale", amount: "799000.00", changed_by: "maxime", changed_at: now }];
  next = 20;
  loadTasks = async () => this.tasks;
  loadVisits = async () => [...this.visits].sort((a, b) => `${b.visit_date}${b.visit_time}`.localeCompare(`${a.visit_date}${a.visit_time}`));
  loadActivity = async () => this.activity;
  loadPriceHistory = async () => this.prices;
  async toggleTask(_listingId: string, taskId: string, completed: boolean, actor: ListingBroker | null) {
    const task = this.tasks.find((item) => item.id === taskId)!;
    Object.assign(task, { completed, completed_at: completed ? now : null, completed_by: completed ? actor : null });
    return task;
  }
  async addTask(_listingId: string, title: string) {
    const task: MarketingTaskRow = { ...this.tasks[0], id: `20000000-0000-4000-8000-${String(this.next++).padStart(12, "0")}`, title, task_key: null, is_custom: true, sort_order: 100 };
    this.tasks.push(task); return task;
  }
  async updateTask(_listingId: string, taskId: string, title: string) { const task = this.tasks.find((item) => item.id === taskId)!; task.title = title; return task; }
  async deleteTask(_listingId: string, taskId: string) { this.tasks = this.tasks.filter((task) => task.id !== taskId); }
  async addVisit(_listingId: string, visit: ListingVisitDraft, actor: ListingBroker | null) {
    const row: VisitRow = { id: `40000000-0000-4000-8000-${String(this.next++).padStart(12, "0")}`, listing_id: listingId, visit_date: visit.visitDate, visit_time: visit.visitTime, visiting_broker_name: visit.visitingBrokerName, visiting_broker_agency: visit.visitingBrokerAgency, buyer_names: visit.buyerNames, feedback: visit.feedback, interest_level: visit.interestLevel, created_by: actor, created_at: now, updated_at: now };
    this.visits.push(row); return row;
  }
  async updateVisit(_listingId: string, visitId: string, visit: ListingVisitDraft) { const row = this.visits.find((item) => item.id === visitId)!; Object.assign(row, { visit_date: visit.visitDate, visit_time: visit.visitTime, visiting_broker_name: visit.visitingBrokerName, visiting_broker_agency: visit.visitingBrokerAgency, buyer_names: visit.buyerNames, feedback: visit.feedback, interest_level: visit.interestLevel }); return row; }
  async deleteVisit(_listingId: string, visitId: string) { this.visits = this.visits.filter((visit) => visit.id !== visitId); }
}

const dateOnly = { visitDate: "2026-08-19", visitTime: null, visitingBrokerName: "", visitingBrokerAgency: "", buyerNames: "", feedback: "", interestLevel: null } satisfies ListingVisitDraft;

describe("service de suivi Listings", () => {
  it("charge ensemble checklist, visites, activité et historique uniquement pour la fiche demandée", async () => {
    const data = await createListingTrackingService(new MemoryTrackingRepository()).getTracking(listingId);
    expect(data.tasks).toHaveLength(9);
    expect(data.visits).toEqual([]);
    expect(data.activity).toEqual([]);
    expect(data.priceHistory[0]).toMatchObject({ purpose: "sale", amount: 799000 });
  });

  it("accepte une visite avec seulement une date et refuse les valeurs d’intérêt inconnues", () => {
    expect(parseVisitDraft(dateOnly)).toEqual(dateOnly);
    expect(parseVisitDraft({ ...dateOnly, interestLevel: "urgent" })).toBeNull();
    expect(parseVisitDraft({ ...dateOnly, visitDate: "19-08-2026" })).toBeNull();
  });

  it.each(["low", "medium", "high"] as const)("accepte le niveau d’intérêt %s", (interestLevel) => {
    expect(parseVisitDraft({ ...dateOnly, interestLevel })?.interestLevel).toBe(interestLevel);
  });

  it("coche puis décoche une tâche avec date et courtier", async () => {
    const repository = new MemoryTrackingRepository(); const service = createListingTrackingService(repository); const taskId = repository.tasks[0].id;
    expect(await service.toggleTask(listingId, taskId, true, "maxime")).toMatchObject({ completed: true, completedAt: now, completedBy: "maxime" });
    expect(await service.toggleTask(listingId, taskId, false, "france")).toMatchObject({ completed: false, completedAt: null, completedBy: null });
  });

  it("ajoute, modifie et supprime uniquement une tâche personnalisée", async () => {
    const repository = new MemoryTrackingRepository(); const service = createListingTrackingService(repository);
    const added = await service.addTask(listingId, " Certificat de localisation ", "sandrine");
    expect(added).toMatchObject({ title: "Certificat de localisation", isCustom: true, taskKey: null });
    expect((await service.updateTask(listingId, added.id, "Nouveau certificat", "sandrine")).title).toBe("Nouveau certificat");
    await service.deleteTask(listingId, added.id, "sandrine");
    expect(repository.tasks).toHaveLength(9);
  });

  it("ajoute une visite complète, conserve son UUID à la modification puis la supprime", async () => {
    const repository = new MemoryTrackingRepository(); const service = createListingTrackingService(repository);
    const full = { ...dateOnly, visitTime: "14:30", visitingBrokerName: "Jean Tremblay", visitingBrokerAgency: "RE/MAX", buyerNames: "Marc et Julie", feedback: "Très intéressés", interestLevel: "high" as const };
    const added = await service.addVisit(listingId, full, "maxime");
    expect(added).toMatchObject({ ...full, createdBy: "maxime" });
    const updated = await service.updateVisit(listingId, added.id, { ...full, feedback: "Demandent les dépenses", interestLevel: "medium" }, "maxime");
    expect(updated).toMatchObject({ id: added.id, feedback: "Demandent les dépenses", interestLevel: "medium" });
    await service.deleteVisit(listingId, added.id, "maxime");
    expect(repository.visits).toEqual([]);
  });

  it("retourne les visites de la plus récente à la plus ancienne", async () => {
    const repository = new MemoryTrackingRepository(); const service = createListingTrackingService(repository);
    await service.addVisit(listingId, { ...dateOnly, visitDate: "2026-08-18" }, null);
    await service.addVisit(listingId, { ...dateOnly, visitDate: "2026-08-20" }, null);
    expect((await service.getTracking(listingId)).visits.map((visit) => visit.visitDate)).toEqual(["2026-08-20", "2026-08-18"]);
  });
});
