import type {
  AdjustedPriceStatistics,
  CmaReportData,
  ComparableAdjustment,
  ComparableAnalysis,
  MarketValueOpinion,
  OpinionValidationErrors,
  ParsedProperty,
  PropertyData,
  ReferencePriceSource,
  ReportPreparerId,
} from "@/app/lib/tools/acm/types";
import { DEFAULT_REPORT_PREPARER } from "@/app/lib/tools/acm/features/analysis/preparers";

export interface ReferencePriceResult {
  price: number | null;
  source: ReferencePriceSource | null;
}

function positiveFinite(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function getReferencePrice(property: PropertyData): ReferencePriceResult {
  const soldPrice = positiveFinite(property.soldPrice);
  if (soldPrice !== null) return { price: soldPrice, source: "sold_price" };

  const askingPrice = positiveFinite(property.askingPrice);
  if (askingPrice !== null) return { price: askingPrice, source: "asking_price" };
  return { price: null, source: null };
}

export function sumAdjustments(adjustments: ComparableAdjustment[]): number {
  return adjustments.reduce((total, adjustment) => {
    return total + (typeof adjustment.amount === "number" && Number.isFinite(adjustment.amount) ? adjustment.amount : 0);
  }, 0);
}

export function buildComparableAnalysis(
  propertyId: string,
  property: PropertyData,
  adjustments: ComparableAdjustment[],
  included = true,
): ComparableAnalysis {
  const reference = getReferencePrice(property);
  const totalAdjustments = sumAdjustments(adjustments);
  return {
    propertyId,
    referencePrice: reference.price,
    referencePriceSource: reference.source,
    adjustments,
    totalAdjustments,
    adjustedPrice: reference.price === null ? null : reference.price + totalAdjustments,
    included,
  };
}

export function calculateAdjustedPriceStatistics(analyses: ComparableAnalysis[]): AdjustedPriceStatistics {
  const values = analyses
    .filter((analysis) => analysis.included && analysis.adjustedPrice !== null && Number.isFinite(analysis.adjustedPrice))
    .map((analysis) => analysis.adjustedPrice as number)
    .sort((left, right) => left - right);

  if (values.length === 0) {
    return { count: 0, minimum: null, maximum: null, average: null, median: null };
  }

  const middle = Math.floor(values.length / 2);
  const median = values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
  return {
    count: values.length,
    minimum: values[0],
    maximum: values[values.length - 1],
    average: values.reduce((total, value) => total + value, 0) / values.length,
    median,
  };
}

export function validateMarketValueOpinion(opinion: MarketValueOpinion): OpinionValidationErrors {
  const errors: OpinionValidationErrors = {};
  const { minimumValue, maximumValue, recommendedValue } = opinion;

  if (minimumValue !== undefined && (!Number.isFinite(minimumValue) || minimumValue < 0)) {
    errors.minimumValue = "La valeur minimale doit être un montant positif ou nul.";
  }
  if (maximumValue !== undefined && (!Number.isFinite(maximumValue) || maximumValue < 0)) {
    errors.maximumValue = "La valeur maximale doit être un montant positif ou nul.";
  } else if (minimumValue !== undefined && maximumValue !== undefined && maximumValue < minimumValue) {
    errors.maximumValue = "La valeur maximale doit être supérieure ou égale à la valeur minimale.";
  }
  if (recommendedValue !== undefined && (!Number.isFinite(recommendedValue) || recommendedValue < 0)) {
    errors.recommendedValue = "La valeur recommandée doit être un montant positif ou nul.";
  } else if (
    recommendedValue !== undefined
    && (
      (minimumValue !== undefined && recommendedValue < minimumValue)
      || (maximumValue !== undefined && recommendedValue > maximumValue)
    )
  ) {
    errors.recommendedValue = "La valeur recommandée doit se situer dans la fourchette indiquée.";
  }

  return errors;
}

export function prepareCmaReportData(
  subject: ParsedProperty,
  includedComparables: ParsedProperty[],
  adjustmentsByPropertyId: Record<string, ComparableAdjustment[]>,
  opinion: MarketValueOpinion,
  preparedBy: ReportPreparerId = DEFAULT_REPORT_PREPARER,
): CmaReportData {
  const comparables = includedComparables.map((property) => ({
    property,
    analysis: buildComparableAnalysis(property.id, property.data, adjustmentsByPropertyId[property.id] ?? [], true),
  }));
  return {
    preparedBy,
    subject,
    comparables,
    statistics: calculateAdjustedPriceStatistics(comparables.map(({ analysis }) => analysis)),
    opinion,
  };
}
