import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scenarios } from "./test-fixtures";
import { analyzeExtractedOaciqDocuments } from "./parser";
import type { OaciqAnalysis } from "./types";

export const comparable = (a: OaciqAnalysis) => ({
  forms: a.forms,
  mainDocument: a.mainDocument,
  acceptanceDateTime: a.acceptanceDateTime,
  acceptanceSource: a.acceptanceSource,
  deadlines: a.deadlines.map(({ title, dateText, details }) => ({
    title,
    dateText,
    details,
  })),
  warnings: a.warnings,
  transactionDates: a.transactionDates,
  allDeadlinesDeferred: a.allDeadlinesDeferred,
});

describe("current Python reference parity (opt-in local oracle, no writes)", () => {
  it.skipIf(!process.env.OACIQ_REFERENCE_PARSER)(
    "same synthetic inputs produce exactly the reference deadlines, forms, warnings and dates",
    () => {
      const result = spawnSync(
        process.env.OACIQ_PYTHON || "python",
        [
          "-B",
          fileURLToPath(new URL("./reference-oracle.py", import.meta.url)),
          process.env.OACIQ_REFERENCE_PARSER!,
        ],
        {
          input: JSON.stringify(scenarios),
          encoding: "utf8",
          maxBuffer: 12 * 1024 * 1024,
          timeout: 60000,
        },
      );
      expect(result.status, result.stderr).toBe(0);
      const expected = JSON.parse(result.stdout);
      if (process.env.OACIQ_PRINT_GOLDENS)
        process.stdout.write(
          "\nOACIQ_GOLDENS=" + JSON.stringify(expected) + "\n",
        );
      for (const s of scenarios)
        expect(
          comparable(analyzeExtractedOaciqDocuments(s.documents)),
          s.name,
        ).toEqual(expected[s.name]);
    },
  );
});
