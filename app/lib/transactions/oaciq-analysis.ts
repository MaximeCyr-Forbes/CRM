import { analyzeOaciqDocuments } from "../oaciq-reader";
import { extractOaciqPdf } from "../oaciq-reader/pdf";
import { documentKind } from "../oaciq-reader/forms";
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
    const kinds = new Set(doc.pages.map((page) => documentKind([page.text])).filter((kind) => kind !== "unknown"));
    return kinds.size > 1;
  });
  const requiresReview = merged || data.forms.some((f) => f.kind === "unknown");
  if (merged) data.warnings.push("À vérifier : ce PDF semble regrouper plusieurs formulaires. Le lecteur source ne les sépare pas automatiquement. Fournissez des PDF séparés, ou vérifiez et corrigez toutes les échéances.");
  if (data.forms.some((f) => f.kind === "unknown")) data.warnings.push("À vérifier : un formulaire non pris en charge (notamment MO/AG) peut modifier les dates. Vérifiez les documents et corrigez les propositions; aucune échéance n’est cochée automatiquement.");
  const details = extractTransactionDetails(documents.find((doc) => doc.name === data.mainDocument));
  return { ...data, ...details, buyerNames: details.buyers.map((p) => p.fullName), sellerNames: details.sellers.map((p) => p.fullName), requiresReview };
}
