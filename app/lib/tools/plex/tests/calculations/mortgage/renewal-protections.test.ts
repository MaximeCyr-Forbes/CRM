import { describe, expect, it } from "vitest";
import {
  calculateTenYearMortgageRenewalProjection,
  type MortgageRenewalProjectionInput,
} from "@/app/lib/tools/plex/domain/calculations/mortgage";

const validInput: MortgageRenewalProjectionInput = {
  purchasePriceInCents: 50_000_000,
  downPayment: { type: "percentage", valuePercent: 20 },
  initialAnnualNominalRatePercent: 5,
  renewalAnnualNominalRatePercent: 6.5,
  firstTermYears: 5,
  amortizationYears: 25,
  startDate: "2026-01-15",
};

function expectCode(input: MortgageRenewalProjectionInput, code: string): void {
  expect(() => calculateTenYearMortgageRenewalProjection(input)).toThrowError(
    expect.objectContaining({ code }),
  );
}

describe("protections du renouvellement", () => {
  it("exige que le premier terme se termine avant dix ans", () => {
    expectCode({ ...validInput, firstTermYears: 10 }, "INVALID_RENEWAL_TERM");
  });

  it("exige un amortissement couvrant la projection", () => {
    expectCode(
      { ...validInput, firstTermYears: 5, amortizationYears: 9 },
      "PROJECTION_EXCEEDS_AMORTIZATION",
    );
  });

  it("refuse un premier terme nul", () => {
    expectCode({ ...validInput, firstTermYears: 0 }, "INVALID_DURATION");
  });

  it("refuse un taux de renouvellement négatif", () => {
    expectCode(
      { ...validInput, renewalAnnualNominalRatePercent: -1 },
      "NEGATIVE_VALUE",
    );
  });
});
