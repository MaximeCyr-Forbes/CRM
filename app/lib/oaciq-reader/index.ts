import { analyzeExtractedOaciqDocuments } from "./parser";
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
  const totalBytes = inputs.reduce(
    (n, input) => n + ("data" in input ? input.data.byteLength : 0),
    0,
  );
  if (totalBytes > OACIQ_LIMITS.bytes)
    throw new Error("Les documents OACIQ sont trop volumineux.");
  const documents: OaciqExtractedDocument[] = [];
  // Sequential: bound peak PDF parsing memory independently of upload count.
  for (const input of inputs)
    documents.push("data" in input ? await extractOaciqPdf(input) : input);
  return analyzeExtractedOaciqDocuments(documents);
}
