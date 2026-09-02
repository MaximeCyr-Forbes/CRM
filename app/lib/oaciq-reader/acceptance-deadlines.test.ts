import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { addAcceptanceDeadline, SOURCE_PARSER_SHA256 } from "./acceptance-deadlines";
import { acceptanceDossier, acceptanceScenarios } from "./acceptance-deadlines-fixtures";
import { analyzeExtractedOaciqDocuments as analyze } from "./parser";
import { proposalsFromAnalysis } from "../transactions/oaciq-agenda";

describe("source acceptance calculations → ISO date → transaction input", () => {
  it.each([
    ["F2.1", 5, "2026-09-06"], ["8.1", 10, "2026-09-11"], ["12.1", 30, "2026-10-01"],
  ])("golden PA %s: %i days gives %s", (section, days, date) => {
    const result = analyze(acceptanceDossier());
    const d = result.deadlines.find((d) => d.sourceSection === section)!;
    expect(d).toMatchObject({ dueDate: date, days, baseDate: "2026-09-01", confidence: "high" });
    expect(d.sourceDocument).toBeTruthy(); expect(d.sourceForm).toBeTruthy(); expect(d.sourceText).toBeTruthy();
    expect(proposalsFromAnalysis(result).find((p) => p.source.section === section)).toMatchObject({ dueDate: date, selected: true });
    expect(result.deadlines.some((d) => d.sourceSection === "14.1")).toBe(false);
  });
  it.each([
    ["F2.1", "2026-09-08"], ["8.1", "2026-09-13"], ["12.1", "2026-10-03"],
  ])("golden final CP overrides PA for %s → %s in either PDF order", (section, date) => {
    const docs = acceptanceDossier({ finalCP: true });
    for (const order of [docs, [...docs].reverse()]) {
      const result = analyze(order);
      expect(result.acceptanceDateTime).toBe("2026-09-03T10:00:00-04:00");
      expect(result.deadlines.find((d) => d.sourceSection === section)?.dueDate).toBe(date);
    }
  });
  it.each(acceptanceScenarios)("no missing ISO date with known calculation base: $name", ({ documents }) => {
    const result = analyze(documents);
    for (const d of result.deadlines.filter((d) => d.days !== null)) {
      if (result.acceptanceDateTime && !result.allDeadlinesDeferred) {
        expect(d.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(d.confidence).toBe("high");
      } else {
        expect(d.dueDate).toBeNull();
        expect(proposalsFromAnalysis(result).find((p) => p.title === d.title)?.selected).toBe(false);
      }
    }
    if (!result.acceptanceDateTime) expect(result.warnings.join(" ")).toContain("acceptation");
  });
  it.each([0, 1, 5, 10, 30, 365])("generic source helper preserves offset %i and never requires a manual date", (days) => {
    const d = addAcceptanceDeadline("2026-09-01", days, "Condition");
    expect(d.days).toBe(days); expect(d.dueDate).not.toBeNull();
    const missing = addAcceptanceDeadline(null, days, "Condition");
    expect(missing.dueDate).toBeNull(); expect(missing.dateText).toContain("après l'acceptation");
  });
  it.skipIf(!process.env.OACIQ_REFERENCE_PARSER)("exact ISO/days/acceptance/warnings parity with the verified last-pushed source", () => {
    const source = process.env.OACIQ_REFERENCE_PARSER!;
    expect(createHash("sha256").update(readFileSync(source)).digest("hex")).toBe(SOURCE_PARSER_SHA256);
    const response = spawnSync(process.env.OACIQ_PYTHON || "python", ["-B", fileURLToPath(new URL("./reference-oracle.py", import.meta.url)), source], {
      input: JSON.stringify(acceptanceScenarios.map((s) => ({ ...s, includeCalculations: true }))),
      encoding: "utf8", maxBuffer: 12 * 1024 * 1024, timeout: 60000,
    });
    expect(response.status, response.stderr).toBe(0);
    const expected = JSON.parse(response.stdout);
    for (const s of acceptanceScenarios) {
      const actual = analyze(s.documents);
      const fields = (r: typeof actual) => ({ acceptanceDateTime: r.acceptanceDateTime, acceptanceSource: r.acceptanceSource,
        warnings: r.warnings, transactionDates: r.transactionDates, allDeadlinesDeferred: r.allDeadlinesDeferred });
      expect(fields(actual), s.name).toEqual(fields(expected[s.name]));
      const relative = actual.deadlines.filter((d) => d.days !== null).map(({ title, dateText, details, dueDate, baseDate, days }) => ({ title, dateText, details, dueDate, baseDate, days }));
      expect(relative, s.name).toEqual(expected[s.name].calculationDeadlines);
    }
  }, 65000);
});
