import type { Address, EntityId, Money } from "./shared";

export interface Property {
  id: EntityId;
  name: string;
  address: Address;
  propertyType: "duplex" | "triplex" | "multiplex" | "other";
  numberOfUnits: number;
  yearBuilt?: number;
  purchasePrice: Money;
}
