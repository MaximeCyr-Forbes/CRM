import type { EntityId, Money } from "./shared";

export interface Income {
  id: EntityId;
  propertyId: EntityId;
  unitId?: EntityId;
  category: "rent" | "parking" | "laundry" | "storage" | "other";
  description: string;
  monthlyAmount: Money;
}
