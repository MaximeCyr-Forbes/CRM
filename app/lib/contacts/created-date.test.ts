import { describe, expect, it } from "vitest";
import { formatContactCreatedDate } from "./created-date";

describe("contact creation date display", () => {
  it("formats the persisted timestamp in French", () => {
    expect(formatContactCreatedDate("2026-11-18T15:00:00Z")).toBe("18 novembre 2026");
  });

  it.each([undefined, null, "", " ", "invalid", "null"])("does not invent a date for %s", (value) => {
    expect(formatContactCreatedDate(value)).toBe("Non disponible");
  });

  it.each([
    ["2026-11-18T00:30:00Z", "17 novembre 2026"],
    ["2026-07-18T03:30:00Z", "17 juillet 2026"],
    ["2026-07-18T04:30:00Z", "18 juillet 2026"],
  ])("uses Toronto daylight-saving rules for %s", (value, expected) => {
    expect(formatContactCreatedDate(value)).toBe(expected);
  });
});
