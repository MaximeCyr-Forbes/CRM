import type { EntityId } from "./shared";

export interface IncomeScenario {
  id: EntityId;
  propertyId: EntityId;
  name: string;
  kind: "current" | "optimistic" | "conservative" | "custom";
  vacancyRate: number;
  annualRentGrowthRate: number;
}
