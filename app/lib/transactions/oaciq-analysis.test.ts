import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { analyzeOaciqTransaction } from "./oaciq-analysis";
import { analyzeOaciqDocuments } from "../oaciq-reader";
import { promise } from "../oaciq-reader/test-fixtures";
import { proposalsFromAnalysis } from "./oaciq-agenda";

async function pdf(name: string, texts: string[]) {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of texts) doc.addPage([612, 792]).drawText(text, { x: 30, y: 755, size: 9, lineHeight: 15, font });
  return { name, data: await doc.save() };
}
describe("dossier multi-PDF réel vers propositions transactionnelles", () => {
  it("conserve exactement les échéances du moteur porté pour une PA et une annexe", async () => {
    const inputs = [await pdf("PA.pdf", [promise().pages[0].text]), await pdf("R.pdf", ["ANNEXE R\nR 30003\nConditions additionnelles sans délai renseigné"] )];
    const expected = await analyzeOaciqDocuments(inputs);
    const actual = await analyzeOaciqTransaction(inputs);
    expect(actual.deadlines).toEqual(expected.deadlines);
    expect(actual.forms).toHaveLength(2);
    expect(actual.deadlines.find((d) => d.type === "inspection")?.dueDate).toBe("2026-08-26");
    expect(actual.deadlines.find((d) => d.type === "financing")?.dueTime).toBeNull();
  });
  it("signale MO non résolu au lieu de confirmer silencieusement les dates initiales", async () => {
    const result = await analyzeOaciqTransaction([await pdf("PA.pdf", [promise().pages[0].text]), await pdf("MO.pdf", ["MODIFICATIONS AUX CONDITIONS\nMO 10002\nLe délai d'inspection est modifié."])]);
    expect(result.requiresReview).toBe(true);
    expect(result.warnings.join(" ")).toContain("MO/AG");
    expect(proposalsFromAnalysis(result).every((d) => !d.selected)).toBe(true);
  });
  it("signale un PDF regroupant PA et CP et laisse toutes les dates à vérifier", async () => {
    const result = await analyzeOaciqTransaction([await pdf("Dossier.pdf", [promise().pages[0].text, "CONTRE-PROPOSITION CP 20002\nP2.1 promesse d'achat 10001\nRÉPONSE DU RÉPONDANT"])]);
    expect(result.requiresReview).toBe(true);
    expect(result.warnings.join(" ")).toContain("regrouper");
    expect(proposalsFromAnalysis(result).every((d) => !d.selected)).toBe(true);
  });
});
