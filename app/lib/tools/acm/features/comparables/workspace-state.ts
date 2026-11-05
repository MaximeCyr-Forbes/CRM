import type { AnalysisWorkspaceStateData } from "@/app/lib/tools/acm/types";
import { createEmptyEmailDraft } from "@/app/lib/tools/acm/features/emails";
import { createComparisonSelection } from "./selection";
import type { ComparisonSelection } from "./selection";
import { DEFAULT_REPORT_PREPARER } from "@/app/lib/tools/acm/features/analysis/preparers";

export interface CmaWorkspaceState extends AnalysisWorkspaceStateData {
  selection: ComparisonSelection;
}

export function createCmaWorkspaceState(propertyIds: string[]): CmaWorkspaceState {
  return {
    preparedBy: DEFAULT_REPORT_PREPARER,
    selection: createComparisonSelection(propertyIds),
    adjustmentsByPropertyId: {},
    opinion: { brokerComment: "" },
    emailDraft: createEmptyEmailDraft(),
  };
}
