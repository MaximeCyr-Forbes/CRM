import { describe, expect, it } from "vitest";
import type { ParsedProperty } from "@/app/lib/tools/acm/types";
import { changeSubject } from "@/app/lib/tools/acm/features/comparables";
import { createAnalysisSnapshot, deserializeAnalysisSnapshot } from "@/app/lib/tools/acm/features/analyses/serialization";
import { addImportedComparable, prepareImportedWorkspace, withCorrectedPropertyData } from "./imported-properties";

function property(id: string, documentType: "centris" | "jlr", address = id): ParsedProperty {
  return {
    id,
    sourceFile: `${id}.pdf`,
    sourceType: "pdf",
    documentType,
    data: { address, propertyCategory: "single_family" },
    fieldConfidence: {},
    overallConfidence: "high",
    pageCount: 1,
    warnings: [],
  };
}

describe("intégration des propriétés JLR au workflow ACM", () => {
  it("conserve le comportement Centris existant", () => {
    const preparation = prepareImportedWorkspace([property("c1", "centris"), property("c2", "centris")]);
    expect(preparation.suggestedSubjectId).toBeUndefined();
    expect(preparation.workspaceState.selection).toEqual({ subjectId: "c1", comparableIds: ["c2"], excludedIds: [] });
  });

  it("ne suggère rien lorsqu’un feuillet JLR est importé seul", () => {
    const preparation = prepareImportedWorkspace([property("j1", "jlr")]);
    expect(preparation.suggestedSubjectId).toBeUndefined();
    expect(preparation.workspaceState.selection.subjectId).toBe("j1");
  });

  it("suggère l’unique JLR comme sujet avec trois fiches Centris", () => {
    const properties = [property("c1", "centris"), property("j1", "jlr"), property("c2", "centris"), property("c3", "centris")];
    const preparation = prepareImportedWorkspace(properties);
    expect(preparation.suggestedSubjectId).toBe("j1");
    expect(preparation.workspaceState.selection).toEqual({ subjectId: "j1", comparableIds: ["c1", "c2", "c3"], excludedIds: [] });
  });

  it("permet de remplacer immédiatement le sujet suggéré", () => {
    const preparation = prepareImportedWorkspace([property("c1", "centris"), property("j1", "jlr")]);
    expect(changeSubject(preparation.workspaceState.selection, "c1").subjectId).toBe("c1");
  });

  it("ne choisit pas arbitrairement entre plusieurs feuillets JLR", () => {
    const preparation = prepareImportedWorkspace([property("c1", "centris"), property("j1", "jlr"), property("j2", "jlr")]);
    expect(preparation.suggestedSubjectId).toBeUndefined();
    expect(preparation.workspaceState.selection.subjectId).toBe("c1");
  });

  it("ajoute un feuillet JLR comme comparable sans changer le sujet", () => {
    const initialProperties = [property("c1", "centris")];
    const initial = prepareImportedWorkspace(initialProperties).workspaceState;
    const addition = addImportedComparable(initialProperties, initial, property("j1", "jlr"));
    expect(addition.workspaceState.selection).toEqual({ subjectId: "c1", comparableIds: ["j1"], excludedIds: [] });
    expect(addition.properties[1].documentType).toBe("jlr");
  });

  it("conserve les corrections faites avant l’ajout du comparable", () => {
    const corrected = withCorrectedPropertyData(property("j1", "jlr", "Adresse extraite"), { address: "Adresse corrigée", yearBuilt: 1988 });
    expect(corrected.data).toEqual({ address: "Adresse corrigée", yearBuilt: 1988 });
    expect(corrected.documentType).toBe("jlr");
  });

  it("persiste la source JLR et le rôle comparable dans le snapshot", () => {
    const properties = [property("c1", "centris"), property("j1", "jlr")];
    const workspaceState = prepareImportedWorkspace(properties).workspaceState;
    const snapshot = createAnalysisSnapshot(properties, workspaceState);
    const restored = deserializeAnalysisSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(restored.properties[1].documentType).toBe("jlr");
    expect(restored.workspaceState.selection).toEqual({ subjectId: "j1", comparableIds: ["c1"], excludedIds: [] });
  });
});
