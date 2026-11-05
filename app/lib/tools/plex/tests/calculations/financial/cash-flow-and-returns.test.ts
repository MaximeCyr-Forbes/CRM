import { describe, expect, it } from "vitest";
import {
  calculateCashFlowAfterMajorWorks,
  calculateCashFlowBeforeMajorWorks,
  calculateDownPaymentReturn,
  calculateInitialInvestment,
  calculateInitialInvestmentReturn,
} from "@/app/lib/tools/plex/domain/calculations/financial";

describe("flux de trésorerie et rendements", () => {
  it("calcule le flux de trésorerie avant travaux majeurs", () => {
    expect(calculateCashFlowBeforeMajorWorks(6_000_000, 4_000_000)).toBe(
      2_000_000,
    );
  });

  it("calcule le flux de trésorerie après travaux majeurs", () => {
    expect(calculateCashFlowAfterMajorWorks(6_000_000, 4_000_000, 1_000_000)).toBe(
      1_000_000,
    );
  });

  it("calcule le rendement sur la mise de fonds", () => {
    expect(calculateDownPaymentReturn(2_000_000, 20_000_000)).toBe(10);
  });

  it("calcule l’investissement initial total", () => {
    expect(
      calculateInitialInvestment(
        20_000_000,
        [1_000_000, 500_000],
        [2_000_000],
        500_000,
      ),
    ).toBe(24_000_000);
  });

  it("calcule le rendement sur l’investissement initial", () => {
    expect(calculateInitialInvestmentReturn(2_400_000, 24_000_000)).toBe(10);
  });
});
