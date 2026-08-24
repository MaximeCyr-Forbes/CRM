import { describe, expect, it } from "vitest";
import type { ListingMarketingTask } from "../../data/listing-types";
import {
  getListingChecklistStats,
  getListingDocumentGroups,
  getVisibleListingTasks,
  listingTaskDisplayTitle,
} from "./checklist";

function task(taskKey: string | null, completed = false, isCustom = false): ListingMarketingTask {
  return {
    id: `task-${taskKey ?? "custom"}`,
    listingId: "listing-1",
    title: taskKey ?? "TÂCHE PERSONNALISÉE",
    taskKey,
    completed,
    completedAt: completed ? "2026-08-24T12:00:00.000Z" : null,
    completedBy: completed ? "maxime" : null,
    sortOrder: 10,
    isCustom,
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:00:00.000Z",
  };
}

const commonDocuments = [
  task("owner_deed", true),
  task("owner_location_certificate"),
  task("owner_land_registry"),
  task("owner_mortgage_statement"),
];
const condoDocuments = [
  task("condo_indivision_agreement"),
  task("condo_insurance"),
  task("condo_preemption_waiver"),
  task("condo_declaration"),
  task("condo_insurance_policy"),
  task("condo_annual_general_meeting"),
  task("condo_minutes"),
  task("condo_financial_statements", true),
  task("condo_budgets"),
  task("condo_reference_unit_description"),
];
const landDocuments = [
  task("land_survey_certificate"),
  task("land_ccg_recommended"),
  task("land_zoning_grid"),
];

describe("checklist conditionnelle des Listings", () => {
  it("affiche seulement les quatre documents communs pour un type standard", () => {
    const groups = getListingDocumentGroups([...commonDocuments, ...condoDocuments, ...landDocuments], "residential");
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks.map(({ taskKey }) => taskKey)).toEqual(commonDocuments.map(({ taskKey }) => taskKey));
  });

  it("affiche 14 documents et les deux sous-sections pour une copropriété", () => {
    const groups = getListingDocumentGroups([...commonDocuments, ...condoDocuments, ...landDocuments], "condo");
    expect(groups.map(({ title }) => title)).toEqual(["DOCUMENTS DE BASE", "COPROPRIÉTÉ INDIVISE", "COPROPRIÉTÉ DIVISE"]);
    expect(groups.flatMap(({ tasks }) => tasks)).toHaveLength(14);
    expect(groups[1].tasks).toHaveLength(3);
    expect(groups[2].tasks).toHaveLength(7);
  });

  it("affiche sept documents pour un terrain", () => {
    const groups = getListingDocumentGroups([...commonDocuments, ...condoDocuments, ...landDocuments], "land");
    expect(groups.map(({ title }) => title)).toEqual(["DOCUMENTS DE BASE", "TERRAIN"]);
    expect(groups.flatMap(({ tasks }) => tasks)).toHaveLength(7);
  });

  it("exclut le parent structurel et les descriptions historiques du progrès", () => {
    const tasks = [
      task("photos", true),
      task("documents", true),
      task("description_fr", false),
      task("description_en", false),
      ...commonDocuments,
      task(null, true, true),
    ];
    const stats = getListingChecklistStats(tasks, "residential");
    expect(stats.total).toBe(6);
    expect(stats.completed).toBe(3);
    expect(stats.remaining).toBe(3);
    expect(stats.visibleTasks.map(({ taskKey }) => taskKey)).not.toContain("documents");
    expect(stats.visibleTasks.map(({ taskKey }) => taskKey)).not.toContain("description_fr");
  });

  it("conserve l’état d’une tâche conditionnelle lors d’un changement de type", () => {
    const tasks = [...commonDocuments, ...condoDocuments];
    expect(getVisibleListingTasks(tasks, "residential").some(({ taskKey }) => taskKey === "condo_financial_statements")).toBe(false);
    const restored = getVisibleListingTasks(tasks, "condo").find(({ taskKey }) => taskKey === "condo_financial_statements");
    expect(restored?.completed).toBe(true);
  });

  it("utilise le libellé DRONE sans changer la clé stable", () => {
    const drone = task("video_drone");
    expect(listingTaskDisplayTitle(drone)).toBe("DRONE");
    expect(drone.taskKey).toBe("video_drone");
  });
});
