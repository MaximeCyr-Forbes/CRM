import { analyzeExtractedOaciqDocuments } from "./parser";
import { documentKind, formNumber, pagesText } from "./forms";
import type {
  OaciqAnalysis,
  OaciqExtractedDocument,
  OaciqPdfInput,
} from "./types";
export type {
  OaciqAnalysis,
  OaciqDeadline,
  OaciqExtractedDocument,
  OaciqPdfInput,
} from "./types";

/** Internal server entry point. No public route, storage, email or Calendar side effects.
 * Files may be PDFs, or already extracted server documents (including OCR pages).
 * OCR rendering is deliberately not a browser/UI dependency of this engine. */
export async function analyzeOaciqDocuments(
  inputs: (OaciqPdfInput | OaciqExtractedDocument)[],
): Promise<OaciqAnalysis> {
  if (typeof window !== "undefined")
    throw new Error("Le lecteur OACIQ doit être exécuté côté serveur.");
  const { extractOaciqPdf, OACIQ_LIMITS } = await import("./pdf");
  if (!inputs.length || inputs.length > OACIQ_LIMITS.files)
    throw new Error("Nombre de documents OACIQ invalide.");
  if (new Set(inputs.map(d=>d.name)).size !== inputs.length)
    throw new Error("Les documents OACIQ doivent avoir des noms distincts.");
  const totalBytes = inputs.reduce(
    (n, input) => n + ("data" in input ? input.data.byteLength : 0),
    0,
  );
  if (totalBytes > OACIQ_LIMITS.bytes)
    throw new Error("Les documents OACIQ sont trop volumineux.");
  const documents: OaciqExtractedDocument[] = [];
  const warnings: string[] = [];
  // Sequential: bound peak PDF parsing memory independently of upload count.
  for (const input of inputs) {
    try {
      const doc = "data" in input ? await extractOaciqPdf(input) : input;
      if (!doc.pages.length || !doc.name) throw new Error('Document vide');
      documents.push(doc);
    } catch { warnings.push(`${input.name} : document impossible à interpréter.`); }
  }
  if (!documents.length) throw new Error("Aucun document OACIQ exploitable.");
  try {
    const result = analyzeExtractedOaciqDocuments(documents);
    result.warnings.push(...warnings);
    return result;
  } catch {
    // Preserve recognized forms when the chain is ambiguous. Do not choose an
    // arbitrary PA or manufacture transaction values to hide the ambiguity.
    return {
      documents:documents.map(d=>({name:d.name,pageCount:d.pages.length,ocrUsed:!!d.ocrPages})),
      forms:documents.map(d=>({document:d.name,kind:documentKind(pagesText(d)),number:formNumber(d.name,pagesText(d))})),
      mainDocument:'',finalPrice:null,priceSourceForm:null,priceSourceDocument:null,priceSourceSection:null,priceConfidence:'low',priceWarnings:[],
      acceptanceDateTime:null,acceptanceSource:'',propertyAddress:null,buyerNames:[],sellerNames:[],deadlines:[],transactionDates:{},allDeadlinesDeferred:false,
      warnings:[...warnings,"Formulaires reconnus, mais leur consolidation nécessite une vérification. Identifiez la promesse d’achat principale et les références des annexes."],
    };
  }
}
