import type { TransactionDeadlineDraft, TransactionDeadlineSource } from "../../data/transaction-types";
import type { OaciqAnalysis, OaciqDeadline } from "../oaciq-reader/types";
import type { OaciqTransactionDetails } from "../oaciq-reader/transaction-details";
import { currentTorontoDateTime, isTransactionDeadlineOverdue, isTransactionDeadlineTime } from "./deadline-time";
import { isExcludedDeadlineSection } from "../oaciq-reader/deadline-sections";

export const OACIQ_UPLOAD_LIMITS = { files: 20, bytes: 4_000_000, timeoutMs: 90_000 } as const;
export const MAX_AGENDA_DEADLINES = 100;
export const MANUAL_DEADLINE_SOURCE: TransactionDeadlineSource = {
  type: "manual", document: null, form: null, section: null, text: null, confidence: null,
};
export const CONFIDENCE_LABELS = { high: "Élevée", medium: "Moyenne", low: "Faible" } as const;
export type DeadlineProposal = TransactionDeadlineDraft & { id: string; selected: boolean; dateText?: string };
export type OaciqTransactionPreview = OaciqAnalysis & OaciqTransactionDetails & { requiresReview: boolean };

export function isAgendaDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2200-12-31") return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateOaciqFiles(files: ReadonlyArray<{ name: string; size: number; type: string }>) {
  if (!files.length || files.length > OACIQ_UPLOAD_LIMITS.files) return "Choisissez entre 1 et 20 fichiers PDF.";
  if (files.some((f) => !/\.pdf$/i.test(f.name) || (f.type && f.type !== "application/pdf") || f.size < 5)) return "Chaque document doit être un fichier PDF valide et non vide.";
  // Leave multipart overhead below Vercel's request body limit. No private PDF storage.
  if (files.reduce((total, f) => total + f.size, 0) > OACIQ_UPLOAD_LIMITS.bytes) return "Le dossier dépasse 4 Mo au total. Réduisez la taille des PDF avant de réessayer.";
  if (new Set(files.map((f) => f.name)).size !== files.length) return "Deux documents portent le même nom. Renommez l’un des PDF pour distinguer leurs sources.";
  return null;
}

export function proposalsFromAnalysis(analysis: OaciqAnalysis & { requiresReview?: boolean }): DeadlineProposal[] {
  const seen = new Set<string>();
  const hasUnresolvedDocument = analysis.requiresReview || analysis.forms.some((form) => form.kind === "unknown");
  return analysis.deadlines.flatMap((d: OaciqDeadline, index) => {
    if (isExcludedDeadlineSection(d.sourceSection)) return [];
    // Conservative: different clauses/documents are never collapsed by date alone.
    const key = JSON.stringify([d.type, d.title.normalize("NFC").trim().toLowerCase(), d.dueDate, d.dueTime, d.sourceDocument, d.sourceSection, d.sourceText]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      id: `oaciq-${index}`, title: d.title, dueDate: d.dueDate ?? "", dueTime: proposedDueTime(d),
      selected: !hasUnresolvedDocument && d.confidence === "high" && isAgendaDate(d.dueDate),
      dateText: d.dateText,
      source: { type: "oaciq", document: d.sourceDocument, form: d.sourceForm, section: d.sourceSection, text: d.sourceText, confidence: d.confidence },
    }];
  });
}

// The reference engine appends a conventional 20h to inspection-report rules.
// Preserve its calculations, but never turn that default into a detected PDF time.
export function proposedDueTime(deadline: OaciqDeadline): string | null {
  if (deadline.dueTime === "20:00" && /inspection/i.test(deadline.type)
      && !/\b20\s*(?:h(?:eures)?(?:\s*00)?|:00)\b|\b8\s*(?::00)?\s*p\.?m\.?/i.test(deadline.sourceText ?? "")) return null;
  return deadline.dueTime;
}

export function parseAgendaDeadlines(input: unknown): TransactionDeadlineDraft[] | null {
  if (!Array.isArray(input) || input.length > MAX_AGENDA_DEADLINES) return null;
  const result: TransactionDeadlineDraft[] = [];
  for (const value of input) {
    if (!value || typeof value !== "object") return null;
    const d = value as Record<string, unknown>;
    if (typeof d.title !== "string" || !d.title.trim() || d.title.trim().length > 300 || !isAgendaDate(d.dueDate) || !(d.dueTime === null || isTransactionDeadlineTime(d.dueTime))) return null;
    const s = d.source as Record<string, unknown> | undefined;
    if (!s || (s.type !== "manual" && s.type !== "oaciq")) return null;
    if (s.type === "manual") {
      result.push({ title: d.title.trim(), dueDate: d.dueDate, dueTime: d.dueTime, source: { ...MANUAL_DEADLINE_SOURCE } });
      continue;
    }
    for (const [key, limit] of [["document", 255], ["form", 100], ["section", 100], ["text", 20000]] as const) {
      if (!(s[key] === null || (typeof s[key] === "string" && (s[key] as string).length <= limit))) return null;
    }
    if (s.confidence !== null && s.confidence !== "high" && s.confidence !== "medium" && s.confidence !== "low") return null;
    if (isExcludedDeadlineSection(s.section as string | null)) return null;
    result.push({ title: d.title.trim(), dueDate: d.dueDate, dueTime: d.dueTime, source: s as TransactionDeadlineSource });
  }
  return result;
}

export function confirmedAgenda(proposals: DeadlineProposal[]) {
  return parseAgendaDeadlines(proposals.filter((p) => p.selected));
}

export function agendaInsertValues(deadlines: TransactionDeadlineDraft[]) {
  return deadlines.map((d) => ({ title: d.title, due_date: d.dueDate, due_time: d.dueTime,
    source_type: d.source.type, source_document: d.source.document, source_form: d.source.form,
    source_section: d.source.section, source_text: d.source.text, source_confidence: d.source.confidence,
  }));
}

export function agendaState(deadline: { completed: boolean; dueDate: string; dueTime: string | null }, now = new Date()) {
  if (deadline.completed) return "FAIT";
  if (isTransactionDeadlineOverdue(deadline, now)) return "EN RETARD";
  return deadline.dueDate === currentTorontoDateTime(now).date ? "AUJOURD’HUI" : "À VENIR";
}
