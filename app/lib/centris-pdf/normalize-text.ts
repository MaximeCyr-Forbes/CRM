import type { ExtractedPDFText } from "./types";

const LIGATURES: Record<string, string> = {
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬀ": "ff",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
};

export function normalizeCentrisText(value: string) {
  let text = value.normalize("NFC");
  for (const [ligature, replacement] of Object.entries(LIGATURES)) {
    text = text.replaceAll(ligature, replacement);
  }
  return text
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanCentrisPage(value: string) {
  let text = normalizeCentrisText(value);
  const documentStart = text.search(/\b\d{7,9}\s*\([^)]{2,80}\)\s*No\s+Centris\b/i);
  if (documentStart >= 0) text = text.slice(documentStart);
  return text
    .replace(/No\s+Centris\s+\d{7,9}\s*-\s*Page\s+\d+\s+de\s+\d+\s+\d{4}-\d{2}-\d{2}\s+à\s+\d{1,2}h\d{2}/gi, " ")
    .replace(/Voir toutes les photos/gi, " ")
    .replace(/\b(?:Façade|Photo aérienne|Vue d'ensemble|Face arrière|Extérieur)(?:\s+(?:Façade|Photo aérienne|Vue d'ensemble|Face arrière|Extérieur)){2,}/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeExtractedPDF(extracted: ExtractedPDFText) {
  const pages = extracted.pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: cleanCentrisPage(page.text),
  }));
  return {
    pageCount: extracted.pageCount,
    pages,
    text: pages.map((page) => page.text).join(" \n "),
  };
}

export function sourcePagesFor(pages: ReadonlyArray<{ pageNumber: number; text: string }>, pattern: RegExp) {
  return pages.filter((page) => {
    pattern.lastIndex = 0;
    return pattern.test(page.text);
  }).map((page) => page.pageNumber);
}

export function removeCentrisSourceBlock(value: string) {
  return value.replace(/\bSource\b[\s\S]*?(?=La présente ne constitue|$)/gi, " ").replace(/\s+/g, " ").trim();
}
