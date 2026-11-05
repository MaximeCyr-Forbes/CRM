import { describe, expect, it } from "vitest";
import type { ComparableAdjustment, ParsedProperty, PropertyData } from "@/app/lib/tools/acm/types";
import {
  buildComparableAnalysis,
  calculateDerivedMetrics,
  createCmaWorkspaceState,
  getComparisonRows,
  prepareCmaReportData,
} from "@/app/lib/tools/acm/features/comparables";
import { createAnalysisSnapshot } from "@/app/lib/tools/acm/features/analyses/serialization";
import { MemoryAnalysisRepository } from "@/app/lib/tools/acm/features/analyses/memory-repository";
import {
  addDraftAdjustment,
  commitComparableEditingDraft,
  createComparableEditingDraft,
  removeDraftAdjustment,
  updateDraftAdjustment,
} from "./comparable-editing-draft";

const first: PropertyData = { address: "10 Rue A", soldPrice: 500_000, landArea: { value: 5_000, unit: "sqft" } };
const second: PropertyData = { address: "20 Rue B", soldPrice: 600_000, bedroomsTotal: 3 };
const positive: ComparableAdjustment = { id: "positive", category: "land", description: "Terrain", amount: 15_000 };
const negative: ComparableAdjustment = { id: "negative", category: "pool", description: "Piscine", amount: -10_000 };

describe("brouillon du modal d’édition d’un comparable", () => {
  it("ouvre chaque comparable avec ses propres données", () => {
    expect(createComparableEditingDraft(first, []).propertyData.address).toBe("10 Rue A");
    expect(createComparableEditingDraft(second, []).propertyData.address).toBe("20 Rue B");
  });

  it("isole les modifications temporaires afin qu’Annuler ne conserve rien", () => {
    const draft = createComparableEditingDraft(first, [positive]);
    draft.propertyData.landArea!.value = 5_900;
    draft.adjustments[0].amount = 25_000;
    expect(first.landArea?.value).toBe(5_000);
    expect(positive.amount).toBe(15_000);
  });

  it("ajoute, modifie et supprime des ajustements positifs ou négatifs", () => {
    let draft = createComparableEditingDraft(first, []);
    draft = addDraftAdjustment(draft, positive);
    draft = addDraftAdjustment(draft, negative);
    draft = updateDraftAdjustment(draft, "positive", { amount: 20_000 });
    expect(buildComparableAnalysis("first", draft.propertyData, draft.adjustments)).toMatchObject({ totalAdjustments: 10_000, adjustedPrice: 510_000 });
    draft = removeDraftAdjustment(draft, "negative");
    expect(draft.adjustments).toEqual([{ ...positive, amount: 20_000 }]);
  });

  it("enregistre séparément PropertyData et ComparableAdjustment puis les restaure", async () => {
    const properties: ParsedProperty[] = [
      { id: "subject", sourceFile: "subject.pdf", data: { propertyCategory: "single_family" }, fieldConfidence: {}, overallConfidence: "low" as const, pageCount: 1, warnings: [] },
      { id: "comparable", sourceFile: "comparable.pdf", data: second, fieldConfidence: {}, overallConfidence: "high" as const, pageCount: 1, warnings: [] },
    ];
    const state = createCmaWorkspaceState(properties.map(({ id }) => id));
    const draft = createComparableEditingDraft(second, [positive, negative]);
    draft.propertyData.bedroomsTotal = 4;
    properties[1] = { ...properties[1], data: draft.propertyData };
    const committed = commitComparableEditingDraft(state, "comparable", draft);
    const repository = new MemoryAnalysisRepository(() => new Date("2026-08-30T12:00:00Z"), () => "analysis-modal");
    await repository.save({ title: "ACM modal", status: "draft", snapshot: createAnalysisSnapshot(properties, committed) });
    const restored = (await repository.get("analysis-modal"))!.snapshot;

    expect(restored.properties[1].data.bedroomsTotal).toBe(4);
    expect(restored.workspaceState.adjustmentsByPropertyId.comparable).toEqual([positive, negative]);
    expect(buildComparableAnalysis("comparable", restored.properties[1].data, restored.workspaceState.adjustmentsByPropertyId.comparable).adjustedPrice).toBe(605_000);
    expect(getComparisonRows("single_family").find(({ id }) => id === "bedroomsTotal")?.value(restored.properties[1].data, calculateDerivedMetrics(restored.properties[1].data))).toBe(4);
    expect(prepareCmaReportData(restored.properties[0], [restored.properties[1]], restored.workspaceState.adjustmentsByPropertyId, restored.workspaceState.opinion).comparables[0].analysis.adjustedPrice).toBe(605_000);
  });
});
