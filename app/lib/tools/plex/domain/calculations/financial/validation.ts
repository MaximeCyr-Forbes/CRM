import { FinancialCalculationError } from "./errors";

export function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new FinancialCalculationError(
      "INVALID_NUMBER",
      `${label} doit être une valeur numérique finie.`,
    );
  }
}

export function assertNonNegativeAmount(value: unknown, label: string): asserts value is number {
  assertFiniteNumber(value, label);
  if (value < 0) {
    throw new FinancialCalculationError(
      "NEGATIVE_AMOUNT",
      `${label} ne peut pas être négatif.`,
    );
  }
}

export function assertNonZero(value: number, label: string): void {
  if (value === 0) {
    throw new FinancialCalculationError(
      "DIVISION_BY_ZERO",
      `${label} ne peut pas être égal à zéro.`,
    );
  }
}

export function assertPurchasePrice(value: unknown): asserts value is number {
  if (value === undefined || value === null) {
    throw new FinancialCalculationError(
      "MISSING_PURCHASE_PRICE",
      "Le prix d’achat analysé est requis.",
    );
  }
  assertNonNegativeAmount(value, "Le prix d’achat analysé");
}

export function assertPercentage(value: unknown, label: string): asserts value is number {
  assertFiniteNumber(value, label);
  if (value < 0 || value > 100) {
    throw new FinancialCalculationError(
      "INVALID_PERCENTAGE",
      `${label} doit être compris entre 0 et 100.`,
    );
  }
}

export function sumNonNegativeAmounts(values: readonly number[], label: string): number {
  return values.reduce((total, value, index) => {
    assertNonNegativeAmount(value, `${label} ${index + 1}`);
    return total + value;
  }, 0);
}
