import { analyzeOaciqDocuments } from "../oaciq-reader";
import { extractOaciqPdf } from "../oaciq-reader/pdf";
import { documentKind, pagesText } from "../oaciq-reader/forms";
import { norm } from "../oaciq-reader/dates";
import { extractTransactionDetails } from "../oaciq-reader/transaction-details";
import type { OaciqPdfInput } from "../oaciq-reader/types";
import type { OaciqTransactionPreview } from "./oaciq-agenda";

/** Preview only: one extraction/consolidated analysis, no save or Google call. */
export async function analyzeOaciqTransaction(inputs: OaciqPdfInput[]): Promise<OaciqTransactionPreview> {
  const documents = [];
  for (const input of inputs) documents.push(await extractOaciqPdf(input));
  const data = await analyzeOaciqDocuments(documents);
  data.warnings.push(...data.priceWarnings);
  const merged = documents.some((doc) => {
    // A PA's clauses mention annexes and counter-proposals. Only standalone
    // form headings identify additional forms, not those cross-references.
    const headings = pagesText(doc).flatMap(text => text.split("\n")).map(norm)
      .map(line => line.replace(/^(?:formulaire obligatoire|mandatory form)\s*[-–—:]?\s*/, ""))
      .filter(line => /^(?:promesse d'achat|promise to purchase|contre-proposition|counter-proposal|annexe [rf]|annex [rf]|annexe eau potable|drinking water and septic|bonifications? avant acceptation)(?:\s+(?:pa|pad|pp|cp|af|ar|bo)?\s*\d{4,6})?(?:\s*[-–—:].*)?$/.test(line));
    const kinds = new Set(headings.map(line => documentKind([line])).filter(kind => kind !== "unknown"));
    return kinds.size > 1;
  });
  const requiresReview = merged || data.forms.some((f) => f.kind === "unknown");
  if (merged) data.warnings.push("À vérifier : ce PDF semble regrouper plusieurs formulaires. Le lecteur source ne les sépare pas automatiquement. Fournissez des PDF séparés, ou vérifiez et corrigez toutes les échéances.");
  if (data.forms.some((f) => f.kind === "unknown")) data.warnings.push("À vérifier : un formulaire non pris en charge (notamment MO/AG) peut modifier les dates. Vérifiez les documents et corrigez les propositions; aucune échéance n’est cochée automatiquement.");
  const details = extractTransactionDetails(documents.find((doc) => doc.name === data.mainDocument));
  return { ...data, ...details, buyerNames: details.buyers.map((p) => p.fullName), sellerNames: details.sellers.map((p) => p.fullName), requiresReview };
}
