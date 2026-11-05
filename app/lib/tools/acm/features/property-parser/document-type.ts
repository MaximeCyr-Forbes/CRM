import type { PropertyDocumentType } from "@/app/lib/tools/acm/types";
import { normalizeSearchText } from "./normalization";

export function detectPropertyDocumentType(rawText: string): PropertyDocumentType {
  const text = normalizeSearchText(rawText);
  if (!text) return "unknown";

  const jlrSignals = [
    /reports impression immeuble\s*\|\s*jlr/,
    /transactions notariees coligees par jlr/,
    /jlr recherche immobiliere/,
  ].filter((pattern) => pattern.test(text)).length;
  if (jlrSignals >= 1 && /\bjlr\b/.test(text)) return "jlr";

  const centrisSignals = [
    /\bfiche centris\b/,
    /\bno centris\b/,
    /\bgenre de propriete\b/,
    /\bdeclaration du vendeur\b/,
  ].filter((pattern) => pattern.test(text)).length;
  if (centrisSignals >= 2 || /\bfiche centris\b/.test(text)) return "centris";

  return "unknown";
}
