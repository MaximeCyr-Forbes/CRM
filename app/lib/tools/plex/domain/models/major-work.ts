import type { EntityId, Money } from "./shared";

export interface MajorWork {
  id: EntityId;
  propertyId: EntityId;
  description: string;
  plannedYear: number;
  estimatedCost: Money;
  status: "planned" | "quoted" | "completed";
}
