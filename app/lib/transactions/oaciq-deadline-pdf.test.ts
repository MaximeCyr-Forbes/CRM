import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { acceptanceDossier } from "../oaciq-reader/acceptance-deadlines-fixtures";
import { prefillPromise } from "./oaciq-prefill-fixtures";
import { analyzeOaciqTransaction } from "./oaciq-analysis";
import { proposalsFromAnalysis } from "./oaciq-agenda";
import type { OaciqExtractedDocument } from "../oaciq-reader/types";

async function pdf(fixture: OaciqExtractedDocument) {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  for (const p of fixture.pages) {
    const page = doc.addPage([p.width, p.height]);
    for (const w of p.words) page.drawText(w.text, { x: w.x0, y: p.height - w.top, font, size: 9 });
  }
  return { name: fixture.name, data: await doc.save() };
}

describe("real PDF bytes → OACIQ transaction analysis → immediately populated date inputs", () => {
  it.each([false, true])("five and thirty days are selectable; reverse PDF order = %s", async (reverse) => {
    const pa = prefillPromise();
    for (const p of pa.pages) p.words = p.words.map((w) => ({ ...w, text: w.text
      .replace("8 jours", "30 jours").replace("2026-09-01 10:00:00", "2026-08-31 10:00:00")
      .replace("2026-09-10 10:04:19", "2026-09-01 10:04:19") }));
    const af = acceptanceDossier()[1];
    af.pages[0].words.unshift({ text: "ANNEXE F AF 40004", x0: 40, top: 40 });
    const inputs = await Promise.all([pa, af].map(pdf));
    const result = await analyzeOaciqTransaction(reverse ? inputs.reverse() : inputs);
    expect(result.paDate).toBe("2026-08-31");
    expect(result.acceptanceDateTime).toBe("2026-09-01T10:04:19-04:00");
    const proposals = proposalsFromAnalysis(result);
    for (const [section, date] of [["F2.1", "2026-09-06"], ["12.1", "2026-10-01"]]) {
      expect(proposals.find((p) => p.source.section === section)).toMatchObject({ dueDate: date, selected: true, source: { confidence: "high" } });
    }
    expect(proposals.every((p) => p.dueDate !== "")).toBe(true);
    expect(proposals.some((p) => p.source.section === "14.1")).toBe(false);
    expect(result.finalPrice).toBe(450000);
  });
});
