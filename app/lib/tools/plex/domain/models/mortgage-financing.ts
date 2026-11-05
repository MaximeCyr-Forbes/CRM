import type { EntityId, Money } from "./shared";

export interface MortgageFinancing {
  id: EntityId;
  propertyId: EntityId;
  lender?: string;
  principal: Money;
  downPayment: Money;
  annualInterestRate: number;
  amortizationYears: number;
  termYears: number;
  paymentFrequency: "monthly" | "accelerated-biweekly" | "biweekly" | "weekly";
}
