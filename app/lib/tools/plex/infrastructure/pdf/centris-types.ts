export type ExtractionConfidence = "high" | "medium" | "low" | "none";
export type ExtractionStatus = "confirmed" | "to_review" | "missing";

export interface ExtractedField<T> {
  key: string;
  label: string;
  value: T | null;
  confidence: ExtractionConfidence;
  page: number | null;
  status: ExtractionStatus;
  sourceText?: string;
}

export interface ExtractedUnit {
  description: ExtractedField<string>;
  currentMonthlyRent: ExtractedField<number>;
  potentialMonthlyRent: ExtractedField<number>;
  occupancyStatus: ExtractedField<"occupied" | "vacant">;
}

export interface CentrisExtraction {
  fileName: string;
  pageCount: number;
  address: ExtractedField<string>;
  propertyType: ExtractedField<string>;
  unitCount: ExtractedField<number>;
  askingPrice: ExtractedField<number>;
  currentAnnualRevenue: ExtractedField<number>;
  potentialAnnualRevenue: ExtractedField<number>;
  reportedEffectiveGrossAnnualRevenue: ExtractedField<number>;
  reportedNetOperatingIncome: ExtractedField<number>;
  municipalTaxes: ExtractedField<number>;
  schoolTaxes: ExtractedField<number>;
  expenses: ExtractedField<number>[];
  units: ExtractedUnit[];
}

export interface PdfTextPage {
  page: number;
  text: string;
}
