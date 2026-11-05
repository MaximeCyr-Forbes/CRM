import { describe, expect, it } from "vitest";
import { formatCad } from "@/app/lib/tools/plex/lib/formatters/currency";

describe("formatCad", () => {
  it("formate les montants en dollars canadiens et en français", () => {
    const result = formatCad({ amountInCents: 123_456, currency: "CAD" });

    expect(result).toContain("1 234,56");
    expect(result).toContain("$");
  });
});
