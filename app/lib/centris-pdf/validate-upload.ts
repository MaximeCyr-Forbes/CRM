export const MAX_CENTRIS_PDF_SIZE_BYTES = 20 * 1024 * 1024;

export type CentrisUploadValidation =
  | { valid: true }
  | { valid: false; status: 400 | 413 | 415; error: string };

export function validateCentrisPDFUpload(file: { name: string; type: string; size: number }): CentrisUploadValidation {
  if (file.size === 0) return { valid: false, status: 400, error: "Le fichier PDF est vide." };
  if (file.size > MAX_CENTRIS_PDF_SIZE_BYTES) {
    return { valid: false, status: 413, error: "Le fichier PDF dépasse la limite de 20 Mo." };
  }
  if (file.type !== "application/pdf" || !file.name.toLocaleLowerCase("fr-CA").endsWith(".pdf")) {
    return { valid: false, status: 415, error: "Seuls les fichiers PDF sont acceptés." };
  }
  return { valid: true };
}
