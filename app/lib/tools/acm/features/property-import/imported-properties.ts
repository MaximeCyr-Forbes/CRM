import type { ParsedProperty, PropertyData } from "@/app/lib/tools/acm/types";
import { changeSubject, createCmaWorkspaceState } from "@/app/lib/tools/acm/features/comparables";
import type { CmaWorkspaceState } from "@/app/lib/tools/acm/features/comparables";

export interface ImportedWorkspacePreparation {
  workspaceState: CmaWorkspaceState;
  suggestedSubjectId?: string;
}

export function prepareImportedWorkspace(properties: ParsedProperty[]): ImportedWorkspacePreparation {
  const initialState = createCmaWorkspaceState(properties.map(({ id }) => id));
  const jlrProperties = properties.filter(({ documentType }) => documentType === "jlr");
  const centrisProperties = properties.filter(({ documentType }) => documentType === "centris");

  if (jlrProperties.length !== 1 || centrisProperties.length === 0) {
    return { workspaceState: initialState };
  }

  const suggestedSubjectId = jlrProperties[0].id;
  return {
    workspaceState: {
      ...initialState,
      selection: changeSubject(initialState.selection, suggestedSubjectId),
    },
    suggestedSubjectId,
  };
}

export function addImportedComparable(
  properties: ParsedProperty[],
  workspaceState: CmaWorkspaceState,
  property: ParsedProperty,
): { properties: ParsedProperty[]; workspaceState: CmaWorkspaceState } {
  if (properties.some(({ id }) => id === property.id)) return { properties, workspaceState };
  return {
    properties: [...properties, property],
    workspaceState: {
      ...workspaceState,
      selection: {
        ...workspaceState.selection,
        comparableIds: [...workspaceState.selection.comparableIds, property.id],
      },
    },
  };
}

export function withCorrectedPropertyData(property: ParsedProperty, data: PropertyData): ParsedProperty {
  return { ...property, data: structuredClone(data) };
}
