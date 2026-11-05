import { describe, expect, it } from "vitest";
import { parseLocalizedMoney } from "@/app/lib/tools/plex/lib/parsers/localized-money";

describe("lecture des montants localisés", () => {
  it.each([
    ["1 250 000 $", 1_250_000],
    ["1\u00a0250\u00a0000 $", 1_250_000],
    ["1\u202f250\u202f000 $", 1_250_000],
    ["1250000", 1_250_000],
    ["1,250,000", 1_250_000],
    ["1.250.000", 1_250_000],
    ["12,500,000.50 $", 12_500_000.5],
    ["12.500.000,50 $", 12_500_000.5],
    ["100 000 000 $", 100_000_000],
    ["$ 100 000 000", 100_000_000],
  ])("lit %s sans perdre de chiffres", (rawValue, expected) => {
    expect(parseLocalizedMoney(rawValue)).toBe(expected);
  });

  it.each(["", "Information manquante", "1 25 000", "12,34,56", "-100", "1$2"])(
    "refuse la valeur ambiguë %s",
    (rawValue) => {
      expect(parseLocalizedMoney(rawValue)).toBeNull();
    },
  );
});
