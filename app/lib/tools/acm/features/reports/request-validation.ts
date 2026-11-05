import type { CmaReportData } from "@/app/lib/tools/acm/types";
import type { ReportGenerationRequest } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseReportGenerationRequest(value: unknown): ReportGenerationRequest | null {
  if (!isRecord(value) || !isRecord(value.report)) return null;
  const report = value.report;
  if (!isRecord(report.subject) || !isRecord(report.subject.data)) return null;
  if (!Array.isArray(report.comparables) || !isRecord(report.statistics) || !isRecord(report.opinion)) return null;
  if (typeof report.opinion.brokerComment !== "string") return null;
  if (value.template !== undefined && value.template !== "classic") return null;
  return { report: report as unknown as CmaReportData, template: value.template as "classic" | undefined };
}
