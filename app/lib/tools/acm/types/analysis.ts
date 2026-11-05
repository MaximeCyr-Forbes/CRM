import type { ParsedProperty } from "./property";

export type ReportPreparerId = "maxime" | "sandrine" | "france";

export type AdjustmentCategory =
  | "location"
  | "land"
  | "area"
  | "year_age"
  | "condition"
  | "renovations"
  | "kitchen"
  | "bathroom"
  | "bedrooms"
  | "garage"
  | "parking"
  | "basement"
  | "pool"
  | "revenue"
  | "units"
  | "rents"
  | "expenses"
  | "zoning"
  | "services"
  | "topography"
  | "floor"
  | "balcony"
  | "condo_fees"
  | "particularity"
  | "other";

export interface ComparableAdjustment {
  id: string;
  category: AdjustmentCategory;
  description: string;
  amount: number | null;
}

export type ReferencePriceSource = "sold_price" | "asking_price";

export interface ComparableAnalysis {
  propertyId: string;
  referencePrice: number | null;
  referencePriceSource: ReferencePriceSource | null;
  adjustments: ComparableAdjustment[];
  totalAdjustments: number;
  adjustedPrice: number | null;
  included: boolean;
}

export interface MarketValueOpinion {
  minimumValue?: number;
  maximumValue?: number;
  recommendedValue?: number;
  brokerComment: string;
}

export interface AdjustedPriceStatistics {
  count: number;
  minimum: number | null;
  maximum: number | null;
  average: number | null;
  median: number | null;
}

export interface CmaReportComparable {
  property: ParsedProperty;
  analysis: ComparableAnalysis;
}

export interface CmaReportData {
  preparedBy: ReportPreparerId;
  subject: ParsedProperty;
  comparables: CmaReportComparable[];
  statistics: AdjustedPriceStatistics;
  opinion: MarketValueOpinion;
}

export interface OpinionValidationErrors {
  minimumValue?: string;
  maximumValue?: string;
  recommendedValue?: string;
}
