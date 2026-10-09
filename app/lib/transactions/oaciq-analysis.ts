import { logOaciqFailure, oaciqFailureMessage } from "../oaciq-reader/diagnostics";
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
  const extractionWarnings: string[] = [];
  for (const [index, input] of inputs.entries()) {
    try { documents.push(await extractOaciqPdf(input)); }
    catch (error) { logOaciqFailure("extraction", error, { index, bytes: input.data.byteLength }); extractionWarnings.push(`${input.name} : ${oaciqFailureMessage(error)}`); }
  }
  if (!documents.length) throw new Error(extractionWarnings.some(w => /lecture visuelle/.test(w)) ? "OCR requis : lecture visuelle indisponible." : "Aucun document OACIQ exploitable.");
  const data = await analyzeOaciqDocuments(documents);
  data.warnings.push(...extractionWarnings);
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
  const hasOcr = documents.some(doc => !!doc.ocrPages);
  if (hasOcr) data.warnings.push("Lecture visuelle utilisée pour un PDF numérisé. Vérifiez les valeurs, les cases cochées et les signatures dans les originaux avant de sélectionner les échéances.");
  const requiresReview = hasOcr || !data.mainDocument || merged || extractionWarnings.length > 0 || data.forms.some((f) => f.kind === "unknown") || !!data.documentaryState?.modifications.some(m=>!m.applied) || data.forms.some(f=>f.kind==='modification' && !data.documentaryState?.modifications.some(m=>m.document===f.document));
  if (merged) data.warnings.push("À vérifier : ce PDF semble regrouper plusieurs formulaires. Le lecteur source ne les sépare pas automatiquement. Fournissez des PDF séparés, ou vérifiez et corrigez toutes les échéances.");
  if (data.forms.some((f) => f.kind === "unknown")) data.warnings.push("À vérifier : un formulaire non pris en charge peut modifier les dates. Vérifiez les documents et corrigez les propositions; aucune échéance n’est cochée automatiquement.");
  const details = extractTransactionDetails(documents.find((doc) => doc.name === data.mainDocument));
  return { ...data, ...details, buyerNames: details.buyers.map((p) => p.fullName), sellerNames: details.sellers.map((p) => p.fullName), requiresReview };
}
