import type { EntityId, Money } from "./shared";

export interface AnnualProjection {
  propertyId: EntityId;
  scenarioId: EntityId;
  year: number;
  grossPotentialIncome: Money;
  vacancyLoss: Money;
  effectiveGrossIncome: Money;
  operatingExpenses: Money;
  netOperatingIncome: Money;
  debtService: Money;
  cashFlowBeforeTax: Money;
}
