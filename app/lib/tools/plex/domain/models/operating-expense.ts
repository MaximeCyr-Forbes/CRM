import type { EntityId, Money } from "./shared";

export interface OperatingExpense {
  id: EntityId;
  propertyId: EntityId;
  category:
    | "municipal-taxes"
    | "school-taxes"
    | "insurance"
    | "energy"
    | "maintenance"
    | "management"
    | "other";
  description: string;
  annualAmount: Money;
}
