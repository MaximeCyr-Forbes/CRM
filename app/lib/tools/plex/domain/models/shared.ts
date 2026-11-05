import type { APP_CURRENCY } from "@/app/lib/tools/plex/config/locale";

export type EntityId = string;
export type IsoDateString = string;

/** Les montants sont conservés en cents afin d'éviter les erreurs d'arrondi. */
export interface Money {
  amountInCents: number;
  currency: typeof APP_CURRENCY;
}

export interface Address {
  civicNumber: string;
  street: string;
  city: string;
  province: "QC";
  postalCode: string;
}
