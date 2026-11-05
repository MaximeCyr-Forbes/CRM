import type { ParsedProperty, PropertyDocumentType } from "@/app/lib/tools/acm/types";
import { detectPropertyDocumentType } from "./document-type";
import { parseCentrisText } from "./parse-centris-text";
import { parseJlrText } from "./parse-jlr-text";
import type { PdfParseMetadata } from "./parser-types";

export class UnsupportedPropertyDocumentError extends Error {
  readonly code = "UNKNOWN_DOCUMENT_TYPE";

  constructor(public readonly documentType: PropertyDocumentType = "unknown") {
    super("Ce document ne semble être ni une fiche Centris ni un feuillet JLR.");
    this.name = "UnsupportedPropertyDocumentError";
  }
}

export function parsePropertyDocument(rawText: string, metadata: PdfParseMetadata): ParsedProperty {
  const documentType = detectPropertyDocumentType(rawText);
  if (documentType === "centris") return parseCentrisText(rawText, metadata);
  if (documentType === "jlr") return parseJlrText(rawText, metadata);
  throw new UnsupportedPropertyDocumentError(documentType);
}
