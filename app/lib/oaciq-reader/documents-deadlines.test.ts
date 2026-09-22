import { describe, expect, it } from "vitest";
import { analyzeExtractedOaciqDocuments as analyze } from "./parser";
import { document, promise } from "./test-fixtures";
import { agendaInsertValues, confirmedAgenda, proposalsFromAnalysis, recalculateDeadlinesFromAcceptanceDate as recalculate } from "../transactions/oaciq-agenda";

// Synthetic PA only: no customer document or identifying data.
export function documentsPromise(accepted = true, reviewDays = 7) {
  const pa = promise({ accepted, documents: 5, date: "2026-09-10" });
  pa.pages[0].text = pa.pages[0].text.replace("déclaration de copropriété", "contrat d’entretien et\ncertificat de conformité").replace("sept (7)", `(${reviewDays})`);
  return pa;
}
const deadlines = (docs = [documentsPromise()]) => analyze(docs).deadlines.filter(d => d.sourceSection === "9.1");
const modification = (value: string) => document("modification.pdf", `MODIFICATIONS MO 60006
M1. IDENTIFICATION DU FORMULAIRE PRINCIPAL PA 10001
M3.1
M3.2
M4. AUTRES MODIFICATIONS
Le délai de remise des documents mentionné à la clause 9.1 de la PA 10001 est modifié : ${value}.
M5. Signatures`);

describe("clause 9.1: delivery then examination", () => {
  it("calculates two reliable dates with distinct types and shared provenance", () => {
    expect(deadlines()).toMatchObject([
      { type: "documents_delivery", days: 5, dueDate: "2026-09-15", confidence: "high", sourceSection: "9.1", sourceForm: "10001" },
      { type: "documents_review", days: 12, dueDate: "2026-09-22", confidence: "high", sourceSection: "9.1", sourceForm: "10001" },
    ]);
  });
  it("reads a different explicit examination interval as the latest generator does", () => {
    expect(deadlines([documentsPromise(true, 10)])[1]).toMatchObject({ days: 15, dueDate: "2026-09-25" });
  });
  it("does not invent an examination interval when absent", () => {
    const pa = documentsPromise(); pa.pages[0].text = pa.pages[0].text.replace(/Dans les \(7\) jours[^\n]+/, "");
    expect(deadlines([pa]).map(d => d.type)).toEqual(["documents_delivery"]);
  });
  it("selects and persists both, including when analysis contains repeated evidence", () => {
    const result = analyze([documentsPromise()]); result.deadlines = [...result.deadlines, ...result.deadlines];
    const proposals = proposalsFromAnalysis(result).filter(p => p.source.section === "9.1");
    expect(proposals).toHaveLength(2); expect(proposals.every(p => p.selected)).toBe(true);
    const saved = agendaInsertValues(confirmedAgenda(proposals)!);
    expect(saved.map(d => [d.title, d.due_date])).toEqual([
      ["Délai pour fournir les documents", "2026-09-15"], ["Délai pour la lecture des documents", "2026-09-22"],
    ]);
    expect(saved.every(d => d.source_type === "oaciq" && d.source_section === "9.1")).toBe(true);
  });
  it("retains both rules without acceptance, including the relation visible in review", () => {
    const proposals = proposalsFromAnalysis(analyze([documentsPromise(false)])).filter(p => p.source.section === "9.1");
    expect(proposals.map(p => p.acceptanceRule?.days)).toEqual([5, 12]);
    expect(proposals.every(p => !p.dueDate && !p.selected)).toBe(true);
    expect(proposals[1].dateText).toContain("7 jours après le délai de remise");
    const updated = recalculate(proposals, "2026-09-10");
    expect(updated.map(p => p.dueDate)).toEqual(["2026-09-15", "2026-09-22"]);
    expect(confirmedAgenda(updated.map(p => ({ ...p, selected: true })))).toHaveLength(2);
    expect(recalculate(updated, "")[1].dateText).toContain("7 jours après le délai de remise");
  });
  it("replaces delivery duration once and shifts examination, also in later recalculation", () => {
    const docs = [documentsPromise(false, 10), modification("8 jours suivant l’acceptation")];
    const result = analyze(docs);
    expect(result.deadlines.filter(d => d.sourceSection === "9.1").map(d => d.days)).toEqual([8, 18]);
    const updated = recalculate(proposalsFromAnalysis(result), "2026-09-10").filter(p => p.source.section === "9.1");
    expect(updated.map(p => p.dueDate)).toEqual(["2026-09-18", "2026-09-28"]);
  });
  it("a fixed delivery modification anchors examination instead of collapsing both dates", () => {
    const result = analyze([documentsPromise(), modification("le 20 septembre 2026")]);
    expect(result.deadlines.filter(d => d.sourceSection === "9.1").map(d => d.dueDate)).toEqual(["2026-09-20", "2026-09-27"]);
    expect(result.transactionDates).toMatchObject({ documents_delivery_deadline: "2026-09-20", documents_review_deadline: "2026-09-27" });
  });
});
