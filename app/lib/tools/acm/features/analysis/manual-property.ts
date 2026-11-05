import type { ParsedProperty, PropertyData } from "@/app/lib/tools/acm/types";
import { changeSubject, createCmaWorkspaceState, type CmaWorkspaceState } from "@/app/lib/tools/acm/features/comparables";

export type ManualPropertyRole = "subject" | "comparable";

export interface ManualPropertyAddition {
  properties: ParsedProperty[];
  workspaceState: CmaWorkspaceState;
  property: ParsedProperty;
}

function defaultPropertyId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createManualProperty(
  data: PropertyData,
  createId: () => string = defaultPropertyId,
): ParsedProperty {
  return {
    id: createId(),
    sourceFile: "Création manuelle",
    sourceType: "manual",
    data: structuredClone(data),
    fieldConfidence: {},
    overallConfidence: "high",
    pageCount: 0,
    warnings: [],
  };
}

export function addManualPropertyToAnalysis(
  properties: ParsedProperty[],
  workspaceState: CmaWorkspaceState | null,
  data: PropertyData,
  role: ManualPropertyRole,
  createId?: () => string,
): ManualPropertyAddition {
  const property = createManualProperty(data, createId);
  const nextProperties = [...properties, property];

  if (!workspaceState || !workspaceState.selection.subjectId) {
    if (role === "comparable") {
      throw new Error("Une propriété sujet est requise avant d’ajouter un comparable.");
    }
    return { properties: nextProperties, workspaceState: createCmaWorkspaceState([property.id]), property };
  }

  if (role === "subject") {
    return {
      properties: nextProperties,
      workspaceState: {
        ...workspaceState,
        selection: changeSubject(workspaceState.selection, property.id),
      },
      property,
    };
  }

  return {
    properties: nextProperties,
    workspaceState: {
      ...workspaceState,
      selection: {
        ...workspaceState.selection,
        comparableIds: [...workspaceState.selection.comparableIds, property.id],
        excludedIds: workspaceState.selection.excludedIds.filter((id) => id !== property.id),
      },
    },
    property,
  };
}
