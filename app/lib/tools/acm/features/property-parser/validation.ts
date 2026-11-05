import {
  MAX_PDF_SIZE_BYTES,
  PDF_MAGIC_BYTES,
  PDF_MIME_TYPE,
} from "./constants";

export interface FileMetadata {
  name: string;
  type: string;
  size: number;
}

export interface ValidationResult {
  valid: boolean;
  code?: string;
  message?: string;
}

export function sanitizeFileName(fileName: string): string {
  const baseName = fileName
    .normalize("NFKC")
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N} ._()\[\]-]/gu, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "fiche-centris.pdf";

  return baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
}

export function validatePdfMetadata(file: FileMetadata): ValidationResult {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return { valid: false, code: "INVALID_EXTENSION", message: "Seuls les fichiers PDF sont acceptés." };
  }

  if (file.type !== PDF_MIME_TYPE) {
    return { valid: false, code: "INVALID_MIME", message: "Le type du fichier doit être application/pdf." };
  }

  if (file.size <= 0) {
    return { valid: false, code: "EMPTY_FILE", message: "Le fichier PDF est vide." };
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return {
      valid: false,
      code: "FILE_TOO_LARGE",
      message: `Le PDF dépasse la limite de ${MAX_PDF_SIZE_BYTES / 1024 / 1024} Mo.`,
    };
  }

  if (file.name.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(file.name)) {
    return { valid: false, code: "UNSAFE_FILE_NAME", message: "Le nom du fichier contient des caractères non permis." };
  }

  return { valid: true };
}

export function hasPdfMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PDF_MAGIC_BYTES.length) return false;
  const signature = String.fromCharCode(...bytes.slice(0, PDF_MAGIC_BYTES.length));
  return signature === PDF_MAGIC_BYTES;
}
