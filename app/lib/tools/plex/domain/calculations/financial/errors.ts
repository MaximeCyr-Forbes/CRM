export type FinancialCalculationErrorCode =
  | "DIVISION_BY_ZERO"
  | "INVALID_NUMBER"
  | "INVALID_PERCENTAGE"
  | "MISSING_PURCHASE_PRICE"
  | "NEGATIVE_AMOUNT"
  | "NEGATIVE_NET_OPERATING_INCOME"
  | "ZERO_UNIT_COUNT";

/** Erreur prévisible et exploitable par la future interface. */
export class FinancialCalculationError extends Error {
  constructor(
    public readonly code: FinancialCalculationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FinancialCalculationError";
  }
}
