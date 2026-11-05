import type { EntityId } from "./shared";

export interface Unit {
  id: EntityId;
  propertyId: EntityId;
  label: string;
  bedrooms?: number;
  areaSquareFeet?: number;
  occupancy: "occupied" | "vacant" | "owner-occupied";
}
