import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acceptanceDossier } from "../oaciq-reader/acceptance-deadlines-fixtures";
import { analyzeExtractedOaciqDocuments as analyze } from "../oaciq-reader/parser";
import { annexR } from "../oaciq-reader/test-fixtures";
import { analyzeOaciqTransaction } from "./oaciq-analysis";
import { agendaInsertValues, confirmedAgenda, MANUAL_DEADLINE_SOURCE, proposalsFromAnalysis, recalculateDeadlinesFromAcceptanceDate as recalculate, type DeadlineProposal } from "./oaciq-agenda";

const missing = () => proposalsFromAnalysis(analyze(acceptanceDossier({ accepted: false })));
const dates = (items: DeadlineProposal[]) => ["F2.1", "8.1", "12.1"].map((section) => items.find((p) => p.source.section === section)?.dueDate);

describe("acceptance fallback — source calculation, without PDF reanalysis", () => {
  it("A: automatic PA acceptance wins; a manual value never substitutes the PA date", () => {
    const analysis = analyze(acceptanceDossier());
    const original = proposalsFromAnalysis(analysis);
    expect(dates(original)).toEqual(["2026-09-06", "2026-09-11", "2026-10-01"]);
    expect(recalculate(original, "2026-08-31", analysis.acceptanceDateTime)).toEqual(original);
  });

  it("B: missing acceptance → one manual date supplies all five/ten/thirty-day calculations", () => {
    const original = missing(), snapshot = structuredClone(original);
    expect(dates(original)).toEqual(["", "", ""]);
    const updated = recalculate(original, "2026-09-01");
    expect(dates(updated)).toEqual(["2026-09-06", "2026-09-11", "2026-10-01"]);
    // The inspection report uses the same source calculation (+10 +4).
    expect(updated.find((p) => /rapport/i.test(p.title))?.dueDate).toBe("2026-09-15");
    expect(original).toEqual(snapshot);
    expect(updated.filter((p) => p.acceptanceRule).every((p) => !p.selected)).toBe(true);
    expect(updated.some((p) => p.source.section === "14.1")).toBe(false);
  });

  it("changes the base centrally, preserving review choices, titles and explicitly edited time", () => {
    const first = recalculate(missing(), "2026-09-01");
    first.find((p) => p.source.section === "F2.1")!.selected = true;
    first.find((p) => p.source.section === "F2.1")!.title = "Preuve de fonds personnalisée";
    first.find((p) => p.source.section === "F2.1")!.dueTime = "16:30";
    const next = recalculate(first, "2026-09-03");
    expect(dates(next)).toEqual(["2026-09-08", "2026-09-13", "2026-10-03"]);
    expect(next.find((p) => p.source.section === "F2.1")).toMatchObject({ selected: true, title: "Preuve de fonds personnalisée", dueTime: "16:30" });
    expect(next.find((p) => p.source.section === "12.1")?.selected).toBe(false);
    expect(recalculate(next.filter((p) => p.source.section !== "12.1"), "2026-09-04").some((p) => p.source.section === "12.1")).toBe(false);
  });

  it.each(["", "2026-02-30", "2026-9-1", "0026-09-01"])("clears stale calculated dates and selection for invalid/removed base %s", (value) => {
    const original = recalculate(missing(), "2026-09-01").map((p) => ({ ...p, selected: true }));
    const cleared = recalculate(original, value);
    expect(dates(cleared)).toEqual(["", "", ""]);
    expect(cleared.filter((p) => p.acceptanceRule).every((p) => !p.selected && p.dateText?.includes("après l'acceptation"))).toBe(true);
    expect(cleared.filter((p) => !p.acceptanceRule)).toEqual(original.filter((p) => !p.acceptanceRule));
  });

  it("fixed dates, manual entries and seller-notice deadlines never follow the acceptance base", () => {
    const deferred = proposalsFromAnalysis(analyze(acceptanceDossier({ accepted: false, deferred: true })));
    expect(deferred.every((p) => !p.acceptanceRule)).toBe(true);
    expect(recalculate(deferred, "2026-09-01")).toEqual(deferred);
    const manual: DeadlineProposal = { id: "manual", title: "Manuelle après acceptation", dueDate: "2026-10-04", dueTime: "12:00", selected: true, source: { ...MANUAL_DEADLINE_SOURCE } };
    const original = [...missing(), manual];
    const updated = recalculate(original, "2026-09-01");
    for (const p of original.filter((p) => !p.acceptanceRule)) expect(updated.find((item) => item.id === p.id)).toBe(p);
  });

  it("R2.3 still uses acceptance even when R2.4 defers other deadlines to the seller notice", () => {
    const analysis = analyze([...acceptanceDossier({ accepted: false }), annexR({ defer: true, cancel: 20 })]);
    expect(analysis.allDeadlinesDeferred).toBe(true);
    expect(analysis.deadlines.find((p) => p.sourceSection === "R2.3")?.relativeRule).toEqual({ reference: "acceptance", days: 20, suffix: "" });
    expect(analysis.deadlines.find((p) => p.sourceSection === "F2.1")?.relativeRule?.reference).toBe("seller_notice");
    const updated = recalculate(proposalsFromAnalysis(analysis), "2026-09-01");
    expect(updated.find((p) => p.source.section === "R2.3")?.dueDate).toBe("2026-09-21");
    expect(updated.find((p) => p.source.section === "F2.1")?.dueDate).toBe("");
  });

  it("C: a final accepted CP overrides PA/manual acceptance in either document order", () => {
    const docs = acceptanceDossier({ finalCP: true });
    for (const order of [docs, [...docs].reverse()]) {
      const analysis = analyze(order);
      expect(analysis.acceptanceDateTime).toBe("2026-09-03T10:00:00-04:00");
      expect(dates(recalculate(proposalsFromAnalysis(analysis), "2026-09-01", analysis.acceptanceDateTime)))
        .toEqual(["2026-09-08", "2026-09-13", "2026-10-03"]);
    }
  });

  it.each([
    ["2026-12-28", "2027-01-02", "2027-01-07", "2027-01-27"],
    ["2026-03-07", "2026-03-12", "2026-03-17", "2026-04-06"],
    ["2026-10-31", "2026-11-05", "2026-11-10", "2026-11-30"],
    ["2028-02-25", "2028-03-01", "2028-03-06", "2028-03-26"],
  ])("calendar-day calculations at year/DST/leap boundary %s", (base, five, ten, thirty) => {
    expect(dates(recalculate(missing(), base))).toEqual([five, ten, thirty]);
    const automatic = proposalsFromAnalysis(analyze(acceptanceDossier({ date: base })));
    expect(dates(recalculate(missing(), base))).toEqual(dates(automatic));
  });

  it("preserves explicit review before saving and strips calculation metadata from persistence", () => {
    const updated = recalculate(missing(), "2026-09-01");
    const selected = updated.map((p) => ({ ...p, selected: p.source.section === "F2.1" || p.source.section === "12.1" }));
    const agenda = confirmedAgenda(selected)!;
    expect(agenda).toHaveLength(2);
    expect(agenda.map((p) => p.dueDate).sort()).toEqual(["2026-09-06", "2026-10-01"]);
    for (const p of [...agenda, ...agendaInsertValues(agenda)]) {
      expect(p).not.toHaveProperty("acceptanceRule");
      expect(p).not.toHaveProperty("relativeRule");
      expect(p).not.toHaveProperty("google_calendar_event_id");
    }
  });

  it.skipIf(!process.env.OACIQ_PRIVATE_ACCEPTANCE_FILES)("real private PA + annexes → missing acceptance → manual fallback, without storing client PDFs", async () => {
    const paths = JSON.parse(process.env.OACIQ_PRIVATE_ACCEPTANCE_FILES!) as string[];
    expect(paths).toHaveLength(3);
    const inputs = paths.map((path, i) => ({ name: `private-${i}.pdf`, data: new Uint8Array(readFileSync(path)) }));
    const analysis = await analyzeOaciqTransaction(inputs);
    expect(analysis.acceptanceDateTime).toBeNull();
    const initial = proposalsFromAnalysis(analysis);
    expect(initial.find((p) => p.source.section === "F2.1")?.acceptanceRule?.days).toBe(5);
    expect(initial.find((p) => p.source.section === "12.1")?.acceptanceRule?.days).toBe(30);
    const updated = recalculate(initial, "2026-09-01");
    expect(updated.find((p) => p.source.section === "F2.1")?.dueDate).toBe("2026-09-06");
    expect(updated.find((p) => p.source.section === "12.1")?.dueDate).toBe("2026-10-01");
    expect(recalculate(updated, "2026-09-03").find((p) => p.source.section === "12.1")?.dueDate).toBe("2026-10-03");
    expect(updated.some((p) => p.source.section === "14.1")).toBe(false);
    expect(initial.find((p) => p.source.section === "F2.1")?.dueDate).toBe("");
    paths.forEach((path, i) => expect(Buffer.compare(readFileSync(path), inputs[i].data)).toBe(0));
  }, 45000);
});
