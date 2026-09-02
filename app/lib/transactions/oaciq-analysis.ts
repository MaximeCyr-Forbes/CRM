import { analyzeOaciqDocuments } from "../oaciq-reader";
import { extractOaciqPdf } from "../oaciq-reader/pdf";
import { documentKind } from "../oaciq-reader/forms";
import { extractPositionedTextFromPDF } from "../pdf/extract-positioned-text";
import { parsePurchaseAgreement } from "../purchase-agreement/parse";
import type { OaciqPdfInput } from "../oaciq-reader/types";
import type { OaciqTransactionPreview } from "./oaciq-agenda";

/** Preview only; reuse both existing engines, never save or contact Google. */
export async function analyzeOaciqTransaction(inputs: OaciqPdfInput[]): Promise<OaciqTransactionPreview> {
  const documents = [];
  for (const input of inputs) documents.push(await extractOaciqPdf(input));
  const data = await analyzeOaciqDocuments(documents);
  const merged = documents.some((doc) => {
    const kinds = new Set(doc.pages.map((page) => documentKind([page.text])).filter((kind) => kind !== "unknown"));
    return kinds.size > 1;
  });
  const requiresReview = merged || data.forms.some((f) => f.kind === "unknown");
  if (merged) data.warnings.push("À vérifier : ce PDF semble regrouper plusieurs formulaires. Le lecteur source ne les sépare pas automatiquement. Fournissez des PDF séparés, ou vérifiez et corrigez toutes les échéances.");
  if (data.forms.some((f) => f.kind === "unknown")) data.warnings.push("À vérifier : un formulaire non pris en charge (notamment MO/AG) peut modifier les dates. Vérifiez les documents et corrigez les propositions; aucune échéance n’est cochée automatiquement.");
  const main = inputs.find((input) => input.name === data.mainDocument);
  let basic = null;
  if (main) {
    try { basic = parsePurchaseAgreement(await extractPositionedTextFromPDF(new Uint8Array(main.data))); }
    catch { data.warnings.push("Les informations de base de la PA sont à vérifier manuellement."); }
  }
  return { ...data, requiresReview, basic };
}
