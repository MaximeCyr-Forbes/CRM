import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { readFileSync } from "node:fs";
import { prefillPromise } from "./oaciq-prefill-fixtures";
import { document, word } from "../oaciq-reader/test-fixtures";
import type { OaciqExtractedDocument } from "../oaciq-reader/types";
import { analyzeOaciqTransaction } from "./oaciq-analysis";
import { prefillOaciqTransaction } from "./oaciq-prefill";
import type { TransactionDraft } from "../../data/transaction-types";

async function pdf(fixture: OaciqExtractedDocument) {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const p of fixture.pages) {
    const page = pdf.addPage([p.width, p.height]);
    for (const w of p.words) page.drawText(w.text, { x: w.x0, y: p.height - w.top, size: 9, font });
  }
  return { name: fixture.name, data: await pdf.save() };
}
function appendix(kind: "BO" | "CP") {
  const bo = ["BONIFICATIONS AVANT ACCEPTATION", "B1. IDENTIFICATION DU FORMULAIRE PRINCIPAL", "Promesse d'achat PA 10001", "B2. BONIFICATION", "B2.1 PRIX D'ACHAT augmenté à (475000 $)", "B2.2 AUTRES", "B3. Signatures", "Signé le 2026-09-02 10:00:00", "BO 60006"];
  const words = kind === "BO" ? bo.map((t, i) => word(t, 40, 40 + i * 20)) : [word("CONTRE-PROPOSITION CP 20002", 40, 40), word("P2.1", 40, 200), word("Promesse d'achat PA 10001", 200, 220), word("P2.2", 40, 240), word("P2.3.1", 40, 265), word("PRIX D'ACHAT (500000 $)", 150, 285), word("P2.3.2", 40, 310), word("P2.3.3", 40, 345), word("P2.3.4", 40, 380), word("P2.4", 40, 430), word("RÉPONSE DU RÉPONDANT", 320, 520), word("Signé le 2026-09-12 10:00:00", 320, 550), word("ACCUSÉ DE RÉCEPTION", 40, 610)];
  return document(`${kind}.pdf`, words.map((w) => w.text).join("\n"), words);
}

describe("PDF → analyse unique → champs Nouvelle Transaction", () => {
  it.each([ [[], 450000], [["BO"], 475000], [["CP"], 500000], [["BO", "CP"], 500000] ] as const)("préremplit avec annexes %j et prix %i", async (kinds, finalPrice) => {
    const inputs = await Promise.all([prefillPromise(true), ...kinds.map(appendix)].map(pdf));
    const analysis = await analyzeOaciqTransaction(inputs);
    const initial: TransactionDraft = { address: "", centrisNumber: "", price: null, promiseDate: null, broker: "maxime", type: "purchase", status: "new", contactIds: [], generalNotes: "" };
    const result = prefillOaciqTransaction(initial, "", analysis, [{ id: "jean", firstName: "Jean", lastName: "Tremblay", email: "jean@example.test", phone: "" }], new Set());
    expect(result.price).toBe(String(finalPrice));
    expect(result.values).toMatchObject({ address: "123 rue Test, Ville-Test, QC, H0H 0H0", centrisNumber: "12345678", promiseDate: "2026-09-01", contactIds: ["jean"], broker: "maxime", status: "new" });
    expect(analysis.buyers).toHaveLength(2); expect(analysis.sellers).toHaveLength(2);
    expect(analysis.acceptanceDateTime?.slice(0, 10)).toBe(kinds.some((kind) => kind === "CP") ? "2026-09-12" : "2026-09-10");
    expect(analysis.deadlines.some((d) => d.sourceSection === "14.1")).toBe(false);
  });
  it.skipIf(!process.env.OACIQ_PRIVATE_PA)("lit la vraie PA locale sans conserver son contenu dans le repository", async () => {
    const result = await analyzeOaciqTransaction([{ name: "PA-privee.pdf", data: new Uint8Array(readFileSync(process.env.OACIQ_PRIVATE_PA!)) }]);
    expect(result.propertyAddress.length).toBeGreaterThan(5);
    expect(result.buyers.length).toBeGreaterThan(0);
    expect(result.sellers.length).toBeGreaterThan(0);
    expect(result.paDate).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
  });
});
