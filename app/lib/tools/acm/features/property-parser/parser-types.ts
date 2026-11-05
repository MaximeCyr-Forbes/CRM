export interface PdfParseMetadata {
  id: string;
  sourceFile: string;
  pageCount: number;
  detectedImageCount?: number;
  includeDebug?: boolean;
}
