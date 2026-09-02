import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analyzeExtractedOaciqDocuments } from "../oaciq-reader/parser";
import { promise, document, scenarios } from "../oaciq-reader/test-fixtures";
import { agendaInsertValues, agendaState, confirmedAgenda, isAgendaDate, MANUAL_DEADLINE_SOURCE, parseAgendaDeadlines, proposedDueTime, proposalsFromAnalysis, validateOaciqFiles } from "./oaciq-agenda";

describe("OACIQ → review → agenda", () => {
  it("conserve les dates et sources du moteur pour tous les golden dossiers", () => {
    for (const scenario of scenarios) {
      const analysis = analyzeExtractedOaciqDocuments(scenario.documents);
      for (const proposal of proposalsFromAnalysis(analysis)) {
        const source = analysis.deadlines.find((d) => d.title === proposal.title && d.sourceDocument === proposal.source.document && (d.dueDate ?? "") === proposal.dueDate)!;
        expect(source).toBeDefined();
        expect(proposal.dueTime).toBe(proposedDueTime(source));
        expect(proposal.source.text).toBe(source.sourceText);
        expect(proposal.source.section).toBe(source.sourceSection);
      }
    }
  });
  it("ne préremplit pas l’heure historique 20h sans mention explicite, et conserve les heures réelles", () => {
    const analysis = analyzeExtractedOaciqDocuments([promise()]);
    const report = analysis.deadlines.find((d) => d.type === "inspection_report")!;
    expect(report.dueTime).toBe("20:00");
    expect(proposedDueTime(report)).toBeNull();
    expect(proposedDueTime({ ...report, sourceText: "Avis à transmettre avant 20h." })).toBe("20:00");
    expect(proposedDueTime({ ...report, sourceText: "Avis à transmettre avant 20 h 00." })).toBe("20:00");
    const occupation = analysis.deadlines.find((d) => d.type === "occupancy")!;
    expect(proposedDueTime(occupation)).toBe("12:00");
  });
  it("enregistre la correction du 26 au 27, pas la proposition initiale", () => {
    const p = proposalsFromAnalysis(analyzeExtractedOaciqDocuments([promise()]));
    const inspection = p.find((d) => /inspection/i.test(d.title))!;
    expect(inspection.dueDate).toBe("2026-08-26");
    inspection.dueDate = "2026-08-27"; inspection.selected = true;
    expect(confirmedAgenda(p)?.find((d) => d.title === inspection.title)?.dueDate).toBe("2026-08-27");
  });
  it("exclut une échéance sur six et conserve l’ajout manuel sans heure inventée", () => {
    const p = Array.from({ length: 6 }, (_, i) => ({ id: String(i), selected: i !== 2, title: `Condition ${i}`, dueDate: "2026-09-10", dueTime: null, source: { ...MANUAL_DEADLINE_SOURCE } }));
    expect(confirmedAgenda(p)).toHaveLength(5);
    expect(confirmedAgenda(p)?.every((d) => d.source.type === "manual" && d.dueTime === null)).toBe(true);
  });
  it("ne coche pas une date ambiguë, MO/AG inconnu ou document fusionné", () => {
    const a = analyzeExtractedOaciqDocuments([promise({ accepted: false })]);
    expect(proposalsFromAnalysis(a).filter((d) => !d.dueDate).every((d) => !d.selected)).toBe(true);
    const mo = analyzeExtractedOaciqDocuments([promise(), document("MO.pdf", "MODIFICATIONS AUX CONDITIONS")]);
    expect(proposalsFromAnalysis(mo).every((d) => !d.selected)).toBe(true);
    expect(proposalsFromAnalysis({ ...a, requiresReview: true }).every((d) => !d.selected)).toBe(true);
  });
  it("déduplique uniquement les mêmes propositions et jamais des conditions distinctes", () => {
    const a = analyzeExtractedOaciqDocuments([promise()]);
    const d = a.deadlines[0];
    a.deadlines = [d, { ...d }, { ...d, title: "Autre condition" }, { ...d, sourceSection: "12.1" }];
    expect(proposalsFromAnalysis(a)).toHaveLength(3);
  });
  it.each(["2026-02-30", "2026-13-10", "2026-09-00", "2026-9-1", "0000-01-01"])("refuse la date %s", (date) => expect(isAgendaDate(date)).toBe(false));
  it("valide les heures, les sources et les longueurs", () => {
    const d = { title: "Test", dueDate: "2026-09-10", dueTime: null, source: MANUAL_DEADLINE_SOURCE };
    expect(parseAgendaDeadlines([d])).toEqual([d]);
    expect(parseAgendaDeadlines([{ ...d, dueTime: "24:00" }])).toBeNull();
    expect(parseAgendaDeadlines([{ ...d, title: " " }])).toBeNull();
    expect(parseAgendaDeadlines([{ ...d, source: { type: "oaciq" } }])).toBeNull();
    expect(parseAgendaDeadlines(Array(101).fill(d))).toBeNull();
    expect(agendaInsertValues([d])[0]).toMatchObject({ due_time: null, source_type: "manual" });
    expect(agendaInsertValues([d])[0]).not.toHaveProperty("google_calendar_event_id");
  });
  it("respecte Toronto, les dates seules, les heures et Fait", () => {
    const d = { completed: false, dueDate: "2026-09-01", dueTime: null };
    expect(agendaState(d, new Date("2026-09-02T02:00:00Z"))).toBe("AUJOURD’HUI");
    expect(agendaState(d, new Date("2026-09-02T12:00:00Z"))).toBe("EN RETARD");
    expect(agendaState({ ...d, completed: true })).toBe("FAIT");
    expect(agendaState({ ...d, dueDate: "2026-09-03" }, new Date("2026-09-02T12:00:00Z"))).toBe("À VENIR");
  });
  it("refuse les uploads invalides et trop lourds", () => {
    const f = { name: "test.pdf", type: "application/pdf", size: 2000 };
    expect(validateOaciqFiles([f, { ...f, name: "annexe.pdf" }])).toBeNull();
    expect(validateOaciqFiles([])).toBeTruthy();
    expect(validateOaciqFiles(Array(21).fill(f))).toBeTruthy();
    expect(validateOaciqFiles([{ ...f, size: 4_000_001 }])).toContain("4 Mo");
    expect(validateOaciqFiles([{ ...f, name: "test.exe" }])).toBeTruthy();
  });
  it("la migration est additive, atomique, idempotente et sans Google", () => {
    const sql = readFileSync("supabase/migrations/20260902154723_add_oaciq_transaction_agenda.sql", "utf8");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("if found then return v_transaction; end if;");
    expect(sql).toContain("public.create_transaction_with_contacts(p_values, p_contact_ids, p_creation_key)");
    expect(sql).toContain("insert into public.transaction_deadlines");
    expect(sql).toContain("'synced'::public.calendar_sync_status, null, null");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).not.toMatch(/delete from|truncate|drop table|net\.http|http_post/i);
    const schema = readFileSync("supabase/schema.sql", "utf8");
    const fn = sql.slice(sql.indexOf("create or replace function public.create_transaction_with_agenda"), sql.indexOf("revoke execute"));
    expect(schema.replace(/\r/g, "")).toContain(fn.replace(/\r/g, ""));
  });
});
