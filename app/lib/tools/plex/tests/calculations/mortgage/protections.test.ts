import { describe, expect, it } from "vitest";
import {
  calculateCanadianFixedMortgage,
  type CanadianFixedMortgageInput,
} from "@/app/lib/tools/plex/domain/calculations/mortgage";

const validInput: CanadianFixedMortgageInput = {
  purchasePriceInCents: 50_000_000,
  downPayment: { type: "percentage", valuePercent: 20 },
  annualNominalInterestRatePercent: 5,
  amortizationYears: 25,
  termYears: 5,
  startDate: "2026-01-15",
};

function expectCode(input: CanadianFixedMortgageInput, code: string): void {
  expect(() => calculateCanadianFixedMortgage(input)).toThrowError(
    expect.objectContaining({ code }),
  );
}

describe("protections de la calculatrice hypothécaire", () => {
  it("refuse un terme supérieur à l’amortissement", () => {
    expectCode(
      { ...validInput, amortizationYears: 5, termYears: 6 },
      "TERM_EXCEEDS_AMORTIZATION",
    );
  });

  it("refuse une date de début invalide", () => {
    expectCode({ ...validInput, startDate: "2026-02-30" }, "INVALID_DATE");
  });

  it("refuse les durées nulles ou fractionnaires", () => {
    expectCode({ ...validInput, amortizationYears: 0 }, "INVALID_DURATION");
    expectCode({ ...validInput, termYears: 2.5 }, "INVALID_DURATION");
  });

  it("refuse les taux et montants négatifs", () => {
    expectCode(
      { ...validInput, annualNominalInterestRatePercent: -1 },
      "NEGATIVE_VALUE",
    );
    expectCode({ ...validInput, purchasePriceInCents: -1 }, "NEGATIVE_VALUE");
  });

  it("refuse une mise de fonds supérieure au prix", () => {
    expectCode(
      {
        ...validInput,
        downPayment: { type: "amount", valueInCents: 60_000_000 },
      },
      "DOWN_PAYMENT_EXCEEDS_PRICE",
    );
  });

  it("refuse une hypothèque dont le montant financé est nul", () => {
    expectCode(
      {
        ...validInput,
        downPayment: { type: "percentage", valuePercent: 100 },
      },
      "ZERO_FINANCED_AMOUNT",
    );
  });
});
