import type { ComparableAdjustment, MarketValueOpinion, ReportPreparerId } from "./analysis";
import type { EmailDraft } from "./email";
import type { ParsedProperty, PropertyCategory } from "./property";

export type AnalysisStatus = "draft" | "completed" | "archived";

export interface AnalysisWorkspaceStateData {
  preparedBy: ReportPreparerId;
  selection: {
    subjectId: string;
    comparableIds: string[];
    excludedIds: string[];
  };
  adjustmentsByPropertyId: Record<string, ComparableAdjustment[]>;
  opinion: MarketValueOpinion;
  emailDraft: EmailDraft;
}

export interface AnalysisSnapshot {
  schemaVersion: 1;
  properties: ParsedProperty[];
  workspaceState: AnalysisWorkspaceStateData;
}

export interface AnalysisSummary {
  id: string;
  title: string;
  status: AnalysisStatus;
  subjectAddress?: string;
  subjectCity?: string;
  propertyCategory?: PropertyCategory;
  clientFirstName?: string;
  clientLastName?: string;
  recommendedValue?: number;
  comparableCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedAnalysis extends AnalysisSummary {
  ownerId: string;
  snapshot: AnalysisSnapshot;
}

export interface SaveAnalysisInput {
  id?: string;
  title: string;
  status: AnalysisStatus;
  snapshot: AnalysisSnapshot;
}

export type AnalysisSort = "recent" | "oldest" | "address";
export type AnalysisStatusFilter = "all" | AnalysisStatus;
