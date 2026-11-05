import type { AdjustedPriceStatistics, CmaReportData, ComparableAnalysis, MarketValueOpinion, ParsedProperty } from "@/app/lib/tools/acm/types";
import type { StaticMapImageLoader } from "./maps/static-map";
import type { ReportPreparerConfig } from "@/app/lib/tools/acm/features/analysis/preparers";

export type ReportTemplateId = "classic";

export interface ReportField {
  label: string;
  value: string;
}

export interface ReportPropertySection {
  property: ParsedProperty;
  title: string;
  subtitle?: string;
  primaryPhoto?: string;
  fields: ReportField[];
  highlights: string[];
}

export interface ReportComparableSection extends ReportPropertySection {
  analysis: ComparableAnalysis;
}

export interface ReportComparisonRow {
  id: string;
  label: string;
  values: string[];
}

export interface ReportDocumentData {
  template: ReportTemplateId;
  fileName: string;
  preparedDate: string;
  preparer: ReportPreparerConfig;
  subject: ReportPropertySection;
  comparables: ReportComparableSection[];
  comparisonRows: ReportComparisonRow[];
  statistics: AdjustedPriceStatistics;
  opinion: MarketValueOpinion;
  source: CmaReportData;
}

export interface ReportGenerationRequest {
  report: CmaReportData;
  template?: ReportTemplateId;
}

export interface ReportPdfOptions {
  mapApiKey?: string;
  mapImageLoader?: StaticMapImageLoader;
}
