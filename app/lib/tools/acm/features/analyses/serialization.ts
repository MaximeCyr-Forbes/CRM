import type {
  AnalysisSnapshot,
  AnalysisSort,
  AnalysisStatusFilter,
  AnalysisSummary,
  AnalysisWorkspaceStateData,
  ParsedProperty,
  SaveAnalysisInput,
} from "../../types";
import { DEFAULT_REPORT_PREPARER, isReportPreparerId } from "@/app/lib/tools/acm/features/analysis/preparers";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createAnalysisSnapshot(properties: ParsedProperty[], workspaceState: AnalysisWorkspaceStateData): AnalysisSnapshot {
  const snapshot = JSON.parse(JSON.stringify({ schemaVersion: 1, properties, workspaceState })) as AnalysisSnapshot;
  for (const property of snapshot.properties) {
    property.sourceType ??= "pdf";
    delete property.debug;
  }
  return snapshot;
}

export function deserializeAnalysisSnapshot(value: unknown): AnalysisSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.properties) || !isRecord(value.workspaceState)) {
    throw new Error("Les données sauvegardées de cette analyse sont invalides.");
  }
  const selection = value.workspaceState.selection;
  if (!isRecord(selection) || typeof selection.subjectId !== "string"
    || !Array.isArray(selection.comparableIds) || !Array.isArray(selection.excludedIds)) {
    throw new Error("La sélection sauvegardée de cette analyse est invalide.");
  }
  const snapshot = JSON.parse(JSON.stringify(value)) as AnalysisSnapshot;
  snapshot.workspaceState.preparedBy = isReportPreparerId(snapshot.workspaceState.preparedBy)
    ? snapshot.workspaceState.preparedBy
    : DEFAULT_REPORT_PREPARER;
  for (const property of snapshot.properties) {
    property.sourceType ??= "pdf";
    if (property.data.bedroomsTotal === undefined && property.data.bedrooms !== undefined) {
      property.data.bedroomsTotal = property.data.bedrooms;
    }
    delete property.data.bedrooms;
    delete property.debug;
  }
  return snapshot;
}

export function getSnapshotSubject(snapshot: AnalysisSnapshot): ParsedProperty | undefined {
  return snapshot.properties.find(({ id }) => id === snapshot.workspaceState.selection.subjectId)
    ?? snapshot.properties[0];
}

export function createDefaultAnalysisTitle(snapshot: AnalysisSnapshot): string {
  const subject = getSnapshotSubject(snapshot);
  const location = [subject?.data.address?.trim(), subject?.data.city?.trim()].filter(Boolean).join(", ");
  return location || (subject?.data.centrisNumber ? `ACM Centris ${subject.data.centrisNumber}` : "Nouvelle ACM");
}

export function deriveAnalysisSummary(input: SaveAnalysisInput, id: string, createdAt: string, updatedAt: string): AnalysisSummary {
  const subject = getSnapshotSubject(input.snapshot);
  const email = input.snapshot.workspaceState.emailDraft;
  return {
    id,
    title: input.title,
    status: input.status,
    subjectAddress: subject?.data.address,
    subjectCity: subject?.data.city,
    propertyCategory: subject?.data.propertyCategory,
    clientFirstName: email.firstName || undefined,
    clientLastName: email.lastName || undefined,
    recommendedValue: input.snapshot.workspaceState.opinion.recommendedValue,
    comparableCount: input.snapshot.workspaceState.selection.comparableIds.length,
    createdAt,
    updatedAt,
  };
}

export function filterAndSortAnalyses(
  analyses: AnalysisSummary[],
  query: string,
  status: AnalysisStatusFilter,
  sort: AnalysisSort,
  propertyCategory = "all",
): AnalysisSummary[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("fr-CA");
  return analyses
    .filter((analysis) => status === "all" || analysis.status === status)
    .filter((analysis) => propertyCategory === "all" || analysis.propertyCategory === propertyCategory)
    .filter((analysis) => {
      if (!normalizedQuery) return true;
      return [analysis.subjectAddress, analysis.subjectCity, analysis.clientFirstName, analysis.clientLastName]
        .some((value) => value?.toLocaleLowerCase("fr-CA").includes(normalizedQuery));
    })
    .sort((left, right) => {
      if (sort === "oldest") return left.updatedAt.localeCompare(right.updatedAt);
      if (sort === "address") return (left.subjectAddress ?? left.title).localeCompare(right.subjectAddress ?? right.title, "fr-CA");
      return right.updatedAt.localeCompare(left.updatedAt);
    });
}
