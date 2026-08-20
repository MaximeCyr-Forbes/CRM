import type { TransactionDraft } from "../../data/transaction-types";
import type { CentrisConfidence, CentrisParseResult } from "./types";

export type CentrisImportField = "address" | "centrisNumber" | "price" | "promiseDate" | "generalNotes";
export type CentrisImportSelection = Record<CentrisImportField, boolean>;

export type CentrisImportPreviewField = {
  field: CentrisImportField;
  currentValue: string | number | null;
  centrisValue: string | number | null;
  confidence: CentrisConfidence;
  available: boolean;
  hasConflict: boolean;
};

const confidenceAllowsDefault = (confidence: CentrisConfidence) => confidence === "high" || confidence === "medium";

function fieldConfidence(result: CentrisParseResult, field: CentrisImportField): CentrisConfidence {
  if (field === "generalNotes") return result.isRecognizedCentrisDocument ? "high" : "low";
  const key = field === "promiseDate" ? "paAcceptedDate" : field;
  return result.confidence[key] ?? "low";
}

function suggestedValue(result: CentrisParseResult, field: CentrisImportField) {
  if (field === "price" && result.pricing.mode === "annual_per_square_foot") return null;
  return result.suggestedTransactionValues[field];
}

function sameValue(current: string | number | null, detected: string | number | null) {
  if (current === null || current === "") return false;
  return String(current).trim() === String(detected ?? "").trim();
}

export function buildCentrisTransactionImportPreview(
  current: TransactionDraft,
  result: CentrisParseResult,
): CentrisImportPreviewField[] {
  const fields: CentrisImportField[] = ["address", "centrisNumber", "price", "promiseDate", "generalNotes"];
  return fields.map((field) => {
    const currentValue = current[field];
    const centrisValue = suggestedValue(result, field);
    const available = centrisValue !== null && String(centrisValue).trim() !== "";
    const hasCurrentValue = currentValue !== null && String(currentValue).trim() !== "";
    return {
      field,
      currentValue,
      centrisValue,
      confidence: fieldConfidence(result, field),
      available,
      hasConflict: available && hasCurrentValue && !sameValue(currentValue, centrisValue),
    };
  });
}

export function defaultCentrisImportSelection(
  current: TransactionDraft,
  result: CentrisParseResult,
): CentrisImportSelection {
  return Object.fromEntries(buildCentrisTransactionImportPreview(current, result).map((item) => {
    const hasCurrentValue = item.currentValue !== null && String(item.currentValue).trim() !== "";
    const safeDefault = item.available
      && confidenceAllowsDefault(item.confidence)
      && (!hasCurrentValue || sameValue(item.currentValue, item.centrisValue));
    const appendableNotes = item.field === "generalNotes" && item.available && confidenceAllowsDefault(item.confidence);
    return [item.field, appendableNotes || safeDefault];
  })) as CentrisImportSelection;
}

function centrisNotesMarker(centrisNumber: string) {
  return centrisNumber ? `FICHE CENTRIS IMPORTÉE — No Centris ${centrisNumber}` : "FICHE CENTRIS IMPORTÉE";
}

export function mergeCentrisGeneralNotes(existing: string, summary: string, centrisNumber: string) {
  const current = existing.trim();
  const incoming = summary.trim();
  if (!incoming) return current;
  const marker = centrisNotesMarker(centrisNumber);
  if (current.includes(marker) || current.includes(incoming)) return current;
  const markedSummary = incoming.replace(/^FICHE CENTRIS IMPORTÉE\b/, marker);
  return current ? `${current}\n\n---\n\n${markedSummary}` : markedSummary;
}

export function applyCentrisTransactionImport(
  current: TransactionDraft,
  result: CentrisParseResult,
  selection: CentrisImportSelection,
): TransactionDraft {
  const next = { ...current };
  if (selection.address && result.suggestedTransactionValues.address) {
    next.address = result.suggestedTransactionValues.address;
  }
  if (selection.centrisNumber && result.suggestedTransactionValues.centrisNumber) {
    next.centrisNumber = result.suggestedTransactionValues.centrisNumber;
  }
  if (
    selection.price
    && result.pricing.mode !== "annual_per_square_foot"
    && result.suggestedTransactionValues.price !== null
  ) {
    next.price = result.suggestedTransactionValues.price;
  }
  if (selection.promiseDate && result.suggestedTransactionValues.promiseDate) {
    next.promiseDate = result.suggestedTransactionValues.promiseDate;
  }
  if (selection.generalNotes) {
    next.generalNotes = mergeCentrisGeneralNotes(
      current.generalNotes,
      result.suggestedTransactionValues.generalNotes,
      result.centrisNumber,
    );
  }
  return next;
}
