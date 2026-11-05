import { describe, expect, it } from "vitest";
import { extractPostalCode, parseArea, parseCount, parseDimensions, parseFrenchDate, parseMoney, parseParkingCount } from "./extractors";

describe("extracteurs Centris", () => {
  it("lit un montant québécois", () => {
    expect(parseMoney("1 249 500 $")).toBe(1_249_500);
  });

  it("lit des dimensions en pieds", () => {
    expect(parseDimensions("42,5 pi x 30 pi")).toEqual({ width: 42.5, depth: 30, unit: "ft" });
  });

  it("lit une superficie métrique", () => {
    expect(parseArea("1 234,5 m²")).toEqual({ value: 1234.5, unit: "sqm" });
  });

  it("normalise une date française", () => {
    expect(parseFrenchDate("14 juin 2026")).toBe("2026-06-14");
  });

  it("normalise un code postal canadien", () => {
    expect(extractPostalCode("Montréal, Québec H2K3L4")).toBe("H2K 3L4");
  });

  it("additionne les chambres hors-sol et au sous-sol", () => {
    expect(parseCount("3 + 1")).toBe(4);
  });

  it("sépare les places d'allée du garage", () => {
    expect(parseParkingCount("Allée (2), Garage (1)")).toBe(2);
  });
});
