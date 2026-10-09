/** Only allowlisted technical codes reach logs; never raw parser messages or filenames. */
export function oaciqErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "PDF_PARSE_FAILED";
  if (/OCR/.test(error.message)) return "OCR_REQUIRED";
  if (error.name === "PasswordException" || /password|encrypted/i.test(error.message)) return "PDF_PASSWORD_REQUIRED";
  if (/trop de pages/.test(error.message)) return "PDF_PAGE_LIMIT";
  if (/invalide ou trop volumineux/.test(error.message)) return "PDF_INVALID";
  return "PDF_PARSE_FAILED";
}
export function logOaciqFailure(stage: "extraction" | "consolidation", error: unknown, details: { index?: number; bytes?: number; documents?: number } = {}) {
  console.warn("oaciq.analysis.failure", { stage, code: stage === "consolidation" ? "CONSOLIDATION_REVIEW_REQUIRED" : oaciqErrorCode(error), ...details });
}
export function oaciqFailureMessage(error: unknown): string {
  switch (oaciqErrorCode(error)) {
    case "OCR_REQUIRED": return "PDF numérisé sans texte exploitable : la lecture visuelle n’a pas abouti. Réessayez l’analyse; aucune date n’a été inventée.";
    case "PDF_PASSWORD_REQUIRED": return "PDF protégé par mot de passe : fournissez une version déverrouillée.";
    case "PDF_PAGE_LIMIT": return "PDF contenant trop de pages.";
    default: return "PDF impossible à interpréter; vérifiez qu’il est valide et lisible.";
  }
}
