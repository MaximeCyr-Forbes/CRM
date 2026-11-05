import type { EntityId } from "./shared";

export interface AnalysisCriteria {
  id: EntityId;
  propertyId: EntityId;
  minimumCapitalizationRate?: number;
  minimumCashOnCashReturn?: number;
  maximumLoanToValue?: number;
  minimumDebtServiceCoverageRatio?: number;
  projectionHorizonYears: number;
}
