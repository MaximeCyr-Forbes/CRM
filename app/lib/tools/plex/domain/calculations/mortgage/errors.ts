export type MortgageCalculationErrorCode =
  | "DOWN_PAYMENT_EXCEEDS_PRICE"
  | "INVALID_DATE"
  | "INVALID_DURATION"
  | "INVALID_NUMBER"
  | "INVALID_RENEWAL_TERM"
  | "NEGATIVE_VALUE"
  | "PROJECTION_EXCEEDS_AMORTIZATION"
  | "TERM_EXCEEDS_AMORTIZATION"
  | "ZERO_FINANCED_AMOUNT";

export class MortgageCalculationError extends Error {
  constructor(
    public readonly code: MortgageCalculationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MortgageCalculationError";
  }
}
