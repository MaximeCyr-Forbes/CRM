import type { ComparableAdjustment, PropertyData } from "@/app/lib/tools/acm/types";
import type { CmaWorkspaceState } from "@/app/lib/tools/acm/features/comparables";

export interface ComparableEditingDraft {
  propertyData: PropertyData;
  adjustments: ComparableAdjustment[];
}

export function createComparableEditingDraft(
  propertyData: PropertyData,
  adjustments: ComparableAdjustment[],
): ComparableEditingDraft {
  return structuredClone({ propertyData, adjustments });
}

export function addDraftAdjustment(
  draft: ComparableEditingDraft,
  adjustment: ComparableAdjustment,
): ComparableEditingDraft {
  return { ...draft, adjustments: [...draft.adjustments, adjustment] };
}

export function updateDraftAdjustment(
  draft: ComparableEditingDraft,
  adjustmentId: string,
  update: Partial<ComparableAdjustment>,
): ComparableEditingDraft {
  return {
    ...draft,
    adjustments: draft.adjustments.map((adjustment) => adjustment.id === adjustmentId
      ? { ...adjustment, ...update }
      : adjustment),
  };
}

export function removeDraftAdjustment(
  draft: ComparableEditingDraft,
  adjustmentId: string,
): ComparableEditingDraft {
  return { ...draft, adjustments: draft.adjustments.filter(({ id }) => id !== adjustmentId) };
}

export function commitComparableEditingDraft(
  workspaceState: CmaWorkspaceState,
  propertyId: string,
  draft: ComparableEditingDraft,
): CmaWorkspaceState {
  return {
    ...workspaceState,
    adjustmentsByPropertyId: {
      ...workspaceState.adjustmentsByPropertyId,
      [propertyId]: structuredClone(draft.adjustments),
    },
  };
}
