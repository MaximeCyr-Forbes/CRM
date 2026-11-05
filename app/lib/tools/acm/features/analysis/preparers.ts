import type { ReportPreparerId } from "@/app/lib/tools/acm/types";

export interface ReportPreparerConfig {
  id: ReportPreparerId;
  displayName: string;
  reportCredentialLines: string[];
  emailSignatureLines: string[];
}

export const DEFAULT_REPORT_PREPARER: ReportPreparerId = "maxime";

export const REPORT_PREPARERS: readonly ReportPreparerConfig[] = [
  {
    id: "maxime",
    displayName: "Maxime",
    reportCredentialLines: ["Courtier immobilier résidentiel", "et commercial"],
    emailSignatureLines: [
      "Maxime Cyr",
      "Courtier immobilier résidentiel et commercial",
      "Équipe Forbes Team",
      "RE/MAX Crystal",
      "438-497-3243",
      "maxime@equipeforbesteam.com",
    ],
  },
  { id: "sandrine", displayName: "Sandrine", reportCredentialLines: [], emailSignatureLines: ["Sandrine", "Équipe Forbes Team", "RE/MAX Crystal"] },
  { id: "france", displayName: "France", reportCredentialLines: [], emailSignatureLines: ["France", "Équipe Forbes Team", "RE/MAX Crystal"] },
] as const;

export function isReportPreparerId(value: unknown): value is ReportPreparerId {
  return REPORT_PREPARERS.some(({ id }) => id === value);
}

export function getReportPreparer(id: ReportPreparerId): ReportPreparerConfig {
  return REPORT_PREPARERS.find((preparer) => preparer.id === id) ?? REPORT_PREPARERS[0];
}
