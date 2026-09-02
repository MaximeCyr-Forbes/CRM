import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { annexF, counter, promise, scenarios } from "./test-fixtures";
import { analyzeExtractedOaciqDocuments } from "./parser";
import type { OaciqAnalysis } from "./types";

export const comparable = (a: OaciqAnalysis) => ({
  // Source ignored BO; this mission recognizes it for price, not acceptance.
  forms: a.forms.map((f) => ({
    ...f,
    kind: f.kind === "bonification" ? "ignored_bo" : f.kind,
  })),
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
      const af = annexF();
      af.pages[0].text = af.pages[0].text.replace("12 jours", "5 jours");
      af.pages[0].words = af.pages[0].words.map((w) =>
        w.text === "12" ? { ...w, text: "5" } : w,
      );
      const inputs = [
        ...scenarios,
        {
          name: "current-f2-pa-five-days",
          documents: [promise({ financing: 0, date: "2026-09-10" }), af],
        },
        {
          name: "current-f2-final-cp-five-days",
          documents: [
            promise({ financing: 0, date: "2026-09-10", counter: "20002" }),
            af,
            counter({ accepted: "2026-09-12T10:00:00-04:00" }),
          ],
        },
      ];
      const result = spawnSync(
        process.env.OACIQ_PYTHON || "python",
        [
          "-B",
          fileURLToPath(new URL("./reference-oracle.py", import.meta.url)),
          process.env.OACIQ_REFERENCE_PARSER!,
        ],
        {
          input: JSON.stringify(inputs),
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
      for (const s of inputs)
        expect(
          comparable(analyzeExtractedOaciqDocuments(s.documents)),
          s.name,
        ).toEqual(expected[s.name]);
    },
  );
});
