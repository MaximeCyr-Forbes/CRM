import { MortgageCalculationError } from "./errors";

export function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MortgageCalculationError(
      "INVALID_NUMBER",
      `${label} doit être une valeur numérique finie.`,
    );
  }
}

export function assertNonNegative(value: unknown, label: string): asserts value is number {
  assertFiniteNumber(value, label);
  if (value < 0) {
    throw new MortgageCalculationError(
      "NEGATIVE_VALUE",
      `${label} ne peut pas être négatif.`,
    );
  }
}

export function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  assertFiniteNumber(value, label);
  if (!Number.isInteger(value) || value <= 0) {
    throw new MortgageCalculationError(
      "INVALID_DURATION",
      `${label} doit être un nombre entier supérieur à zéro.`,
    );
  }
}

export function parseIsoDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new MortgageCalculationError(
      "INVALID_DATE",
      "La date de début doit respecter le format AAAA-MM-JJ.",
    );
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new MortgageCalculationError("INVALID_DATE", "La date de début est invalide.");
  }
  return parsed;
}
