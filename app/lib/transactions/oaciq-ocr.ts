/** Bounded OCR transport shared by the browser and the protected preview route. */
export const OACIQ_OCR_LIMITS = { bytes: 450_000, pages: 150, pageCharacters: 30_000, wordsPerPage: 5_000 } as const;
export type OaciqOcrWord = [string, number, number, number, number];
export type OaciqOcrDocument = { index: number; pages: string[]; words?: OaciqOcrWord[][] };
export function parseOaciqOcr(value: FormDataEntryValue | null, fileCount: number): OaciqOcrDocument[] {
  if (value === null) return [];
  if (typeof value !== "string" || new TextEncoder().encode(value).length > OACIQ_OCR_LIMITS.bytes) throw new Error("Lecture visuelle trop volumineuse ou invalide.");
  let docs: unknown;
  try { docs = JSON.parse(value); } catch { throw new Error("Lecture visuelle invalide."); }
  if (!Array.isArray(docs) || docs.length > fileCount) throw new Error("Lecture visuelle invalide.");
  const seen = new Set<number>();
  let pages = 0;
  for (const doc of docs) {
    if (!doc || !Number.isInteger(doc.index) || doc.index < 0 || doc.index >= fileCount || seen.has(doc.index)
      || !Array.isArray(doc.pages) || !doc.pages.length || doc.pages.some((p: unknown) => typeof p !== "string" || p.length > OACIQ_OCR_LIMITS.pageCharacters)) throw new Error("Pages de lecture visuelle invalides.");
    seen.add(doc.index); pages += doc.pages.length;
    if (pages > OACIQ_OCR_LIMITS.pages) throw new Error("Trop de pages de lecture visuelle.");
    if (doc.words !== undefined && (!Array.isArray(doc.words) || doc.words.length !== doc.pages.length || doc.words.some((words: unknown) =>
      !Array.isArray(words) || words.length > OACIQ_OCR_LIMITS.wordsPerPage || words.some((w: unknown) =>
        !Array.isArray(w) || w.length !== 5 || typeof w[0] !== "string" || w[0].length > 300 || w.slice(1).some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 20_000))))) throw new Error("Positions de lecture visuelle invalides.");
  }
  return docs;
}
