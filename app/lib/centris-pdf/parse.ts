import { normalizeExtractedPDF, removeCentrisSourceBlock, sourcePagesFor } from "./normalize-text";
import { parseCentrisAddress } from "./parse-address";
import { parseCentrisPricing } from "./parse-price";
import { parseCentrisProperty } from "./parse-property";
import { mapCentrisResultToTransactionSuggestions } from "./transaction-mapping";
import type { CentrisMarketStatus, CentrisParseResult, ExtractedPDFText } from "./types";

export const CENTRIS_PARSER_VERSION = "1.0.0";

function marketStatus(raw: string): CentrisMarketStatus {
  if (/^En vigueur\b/i.test(raw)) return "active";
  if (/^Vendu\b/i.test(raw)) return "sold";
  if (/^Loué\b/i.test(raw)) return "rented";
  return "unknown";
}

function explicitDate(text: string, labels: RegExp) {
  const match = labels.exec(text);
  if (!match) return null;
  const immediatelyAfter = /^\s*(\d{4}-\d{2}-\d{2})\b/.exec(text.slice(match.index + match[0].length, match.index + match[0].length + 45));
  if (immediatelyAfter) return immediatelyAfter[1];
  const before = /(\d{4}-\d{2}-\d{2})\s*$/.exec(text.slice(Math.max(0, match.index - 35), match.index));
  if (before) return before[1];
  const value = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text.slice(match.index, match.index + 130));
  return value?.[1] ?? null;
}

function section(text: string, start: RegExp, end: RegExp) {
  const startMatch = start.exec(text);
  if (!startMatch) return "";
  const from = startMatch.index + startMatch[0].length;
  const remainder = text.slice(from);
  const endMatch = end.exec(remainder);
  return removeCentrisSourceBlock((endMatch ? remainder.slice(0, endMatch.index) : remainder).trim());
}

function parseSections(text: string): CentrisParseResult["sections"] {
  return {
    inclusions: section(text, /\bInclusions\b/i, /\bExclusions\b/i),
    exclusions: section(text, /\bExclusions\b/i, /\bRemarques\b/i),
    remarks: section(text, /\bRemarques\b/i, /\bAddenda\b/i),
    addendum: section(text, /\bAddenda\b/i, /\bDéclaration du vendeur\b|\bSource\b/i),
  };
}

function safeFileName(value: string) {
  return value.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180) || "fiche-centris.pdf";
}

export function parseCentrisText(extracted: ExtractedPDFText, sourceFileName: string): CentrisParseResult {
  const normalized = normalizeExtractedPDF(extracted);
  const firstPage = normalized.pages[0]?.text ?? "";
  const header = /\b(\d{7,9})\s*\(([^)]{2,80})\)\s*No\s+Centris\b/i.exec(firstPage)
    ?? /No\s+Centris\s+(\d{7,9})\s*\(([^)]{2,80})\)/i.exec(firstPage);
  const centrisNumber = header?.[1] ?? "";
  const centrisMarketStatusRaw = header?.[2]?.trim() ?? "";
  const isRecognizedCentrisDocument = Boolean(header && /Genre|Zonage|Évaluation|Superficie/i.test(firstPage));
  const address = parseCentrisAddress(firstPage);
  const pricing = parseCentrisPricing(firstPage);
  const { property, financial, rentalUnits } = parseCentrisProperty(normalized.text);
  const dates = {
    paAcceptedDate: explicitDate(normalized.text, /Date PA acceptée/i),
    conditionsLiftedDate: explicitDate(normalized.text, /Date de levée des conditions/i),
    occupancyDate: explicitDate(normalized.text, /Date (?:ou délai d’occupation|d'occupation)/i),
  };
  const warnings: string[] = [];
  if (!isRecognizedCentrisDocument) warnings.push("Le document ne correspond pas clairement à une fiche détaillée Centris.");
  if (!address.fullAddress) warnings.push("Adresse non détectée avec suffisamment de confiance.");
  if (pricing.mode === "annual_per_square_foot") {
    warnings.push("Tarif annuel au pied carré détecté. Le prix de la Transaction doit être confirmé manuellement.");
  } else if (pricing.mode === "unknown") {
    warnings.push("Prix Centris non détecté avec suffisamment de confiance.");
  }
  warnings.push("Le type, le statut et le courtier de la Transaction doivent être confirmés manuellement.");

  const baseResult: Omit<CentrisParseResult, "suggestedTransactionValues"> = {
    sourceFileName: safeFileName(sourceFileName),
    pageCount: normalized.pageCount,
    parserVersion: CENTRIS_PARSER_VERSION,
    isRecognizedCentrisDocument,
    centrisNumber,
    centrisMarketStatus: marketStatus(centrisMarketStatusRaw),
    centrisMarketStatusRaw,
    address,
    property,
    pricing,
    dates,
    financial,
    rentalUnits,
    sections: parseSections(normalized.text),
    confidence: {
      centrisNumber: centrisNumber ? "high" : "low",
      centrisMarketStatus: centrisMarketStatusRaw ? "high" : "low",
      address: address.fullAddress ? "high" : "low",
      propertyType: property.genreRaw ? "high" : "low",
      price: pricing.mode === "unknown" ? "low" : "high",
      paAcceptedDate: dates.paAcceptedDate ? "high" : "low",
    },
    sourcePages: {
      centrisNumber: sourcePagesFor(normalized.pages, /No\s+Centris|\b\d{7,9}\s*\([^)]*\)/i),
      address: sourcePagesFor(normalized.pages, /No\s+Centris|\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/i),
      propertyType: sourcePagesFor(normalized.pages, /Genre de propriété|\bTerrain\b/i),
      price: sourcePagesFor(normalized.pages, /\$\s*(?:\/\s*(?:mois|année|an))?/i),
      paAcceptedDate: sourcePagesFor(normalized.pages, /Date PA acceptée/i),
      sections: sourcePagesFor(normalized.pages, /\b(?:Inclusions|Exclusions|Remarques|Addenda)\b/i),
    },
    warnings,
  };
  return {
    ...baseResult,
    suggestedTransactionValues: mapCentrisResultToTransactionSuggestions(baseResult),
  };
}
