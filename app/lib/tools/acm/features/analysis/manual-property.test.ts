import { describe, expect, it } from "vitest";
import type { ParsedProperty, PropertyData } from "@/app/lib/tools/acm/types";
import { createCmaWorkspaceState } from "@/app/lib/tools/acm/features/comparables";
import { createAnalysisSnapshot } from "@/app/lib/tools/acm/features/analyses/serialization";
import { MemoryAnalysisRepository } from "@/app/lib/tools/acm/features/analyses/memory-repository";
import { getPropertyEditorFieldPaths } from "./components/property-editor";
import { addManualPropertyToAnalysis, createManualProperty } from "./manual-property";

function pdfProperty(id: string): ParsedProperty {
  return {
    id,
    sourceFile: `${id}.pdf`,
    sourceType: "pdf",
    data: { address: id },
    fieldConfidence: {},
    overallConfidence: "high",
    pageCount: 1,
    warnings: [],
  };
}

describe("création manuelle d’une propriété", () => {
  it("crée un identifiant interne sans exiger Centris, prix, statut ou PDF", () => {
    const property = createManualProperty({ address: "10 rue Manuelle" }, () => "manual-1");
    expect(property).toMatchObject({
      id: "manual-1",
      sourceType: "manual",
      sourceFile: "Création manuelle",
      pageCount: 0,
      data: { address: "10 rue Manuelle" },
    });
    expect(property.data).not.toHaveProperty("centrisNumber");
    expect(property.data).not.toHaveProperty("askingPrice");
    expect(property.data).not.toHaveProperty("status");
  });

  it("ajoute la propriété comme sujet et conserve les fiches PDF comme comparables", () => {
    const properties = [pdfProperty("pdf-subject"), pdfProperty("pdf-comparable")];
    const state = createCmaWorkspaceState(properties.map(({ id }) => id));
    const addition = addManualPropertyToAnalysis(properties, state, { address: "Sujet sans fiche" }, "subject", () => "manual-subject");

    expect(addition.workspaceState.selection).toMatchObject({
      subjectId: "manual-subject",
      comparableIds: ["pdf-subject", "pdf-comparable"],
    });
    expect(addition.properties.map(({ sourceType }) => sourceType)).toEqual(["pdf", "pdf", "manual"]);
  });

  it("ajoute une propriété sans prix comme comparable", () => {
    const properties = [pdfProperty("subject")];
    const addition = addManualPropertyToAnalysis(
      properties,
      createCmaWorkspaceState(["subject"]),
      { city: "Laval", propertyCategory: "condo" },
      "comparable",
      () => "manual-comparable",
    );

    expect(addition.workspaceState.selection.subjectId).toBe("subject");
    expect(addition.workspaceState.selection.comparableIds).toEqual(["manual-comparable"]);
    expect(addition.property.data.askingPrice).toBeUndefined();
  });

  it("exige un sujet avant de créer un comparable isolé", () => {
    expect(() => addManualPropertyToAnalysis([], null, {}, "comparable", () => "manual")).toThrow("propriété sujet");
  });

  it("conserve les données propres aux terrains et aux propriétés à revenus", () => {
    const land = createManualProperty({ propertyCategory: "land", landArea: { value: 20_000, unit: "sqft" }, zoning: ["Résidentiel"] }, () => "land");
    const incomeData: PropertyData = {
      propertyCategory: "income_property",
      incomeProperty: { numberOfUnits: 6, grossPotentialRevenue: 92_000, operatingExpenses: 21_000, netOperatingIncome: 71_000, grossRevenueMultiplier: 10.5, pricePerDoor: 150_000 },
    };
    const income = createManualProperty(incomeData, () => "income");

    expect(land.data.landArea?.value).toBe(20_000);
    expect(income.data.incomeProperty).toEqual(incomeData.incomeProperty);
  });

  it("adapte les champs du formulaire à la catégorie", () => {
    const land = getPropertyEditorFieldPaths("manual", "land");
    const condo = getPropertyEditorFieldPaths("manual", "condo");
    const income = getPropertyEditorFieldPaths("manual", "income_property");

    expect(land).toContain("landArea.value");
    expect(land).not.toContain("bedroomsTotal");
    expect(land).not.toContain("buildingArea.value");
    expect(condo).toContain("livingArea.value");
    expect(condo).not.toContain("landArea.value");
    expect(income).toContain("incomeProperty.numberOfUnits");
    expect(income).toContain("incomeProperty.netOperatingIncome");
  });

  it("sauvegarde et recharge le rôle sujet ainsi que la source manuelle", async () => {
    const properties = [pdfProperty("pdf-1"), pdfProperty("pdf-2")];
    const addition = addManualPropertyToAnalysis(properties, createCmaWorkspaceState(["pdf-1", "pdf-2"]), { address: "88 rue Sans-PDF" }, "subject", () => "manual-persisted");
    const repository = new MemoryAnalysisRepository(() => new Date("2026-08-30T20:00:00Z"), () => "analysis-manual");

    await repository.save({ title: "ACM manuelle", status: "draft", snapshot: createAnalysisSnapshot(addition.properties, addition.workspaceState) });
    const restored = (await repository.get("analysis-manual"))!.snapshot;

    expect(restored.workspaceState.selection.subjectId).toBe("manual-persisted");
    expect(restored.properties.find(({ id }) => id === "manual-persisted")).toMatchObject({
      sourceType: "manual",
      data: { address: "88 rue Sans-PDF" },
    });
    expect(restored.workspaceState.selection.comparableIds).toEqual(["pdf-1", "pdf-2"]);
  });
});
