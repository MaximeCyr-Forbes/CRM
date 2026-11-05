export interface ExtractedPdfContent {
  text: string;
  pageCount: number;
  metadata: Record<string, string>;
}

/** Contrat futur; aucune bibliothèque d'extraction n'est encore choisie. */
export interface PdfExtractionService {
  extract(file: ArrayBuffer): Promise<ExtractedPdfContent>;
}
