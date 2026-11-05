import type { EntityId, Money } from "./shared";

export interface AcquisitionCost {
  id: EntityId;
  propertyId: EntityId;
  category: "transfer-tax" | "inspection" | "notary" | "appraisal" | "other";
  description: string;
  amount: Money;
}
