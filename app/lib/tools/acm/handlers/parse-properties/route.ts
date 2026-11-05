import { randomUUID } from "node:crypto";
import type { ParsePropertiesResponse, PropertyParseError } from "@/app/lib/tools/acm/types";
import { extractPdfContent, PdfReadError } from "@/app/lib/tools/acm/features/property-parser/server/pdf-reader";
import { parsePropertyDocument, UnsupportedPropertyDocumentError } from "@/app/lib/tools/acm/features/property-parser/parse-property-document";
import { hasPdfMagicBytes, sanitizeFileName, validatePdfMetadata } from "@/app/lib/tools/acm/features/property-parser/validation";
import { extractOriginalFirstPage } from "@/app/lib/tools/acm/features/reports/pdf/extract-first-page";

export const runtime = "nodejs";
export const maxDuration = 60;

function errorResponse(error: PropertyParseError, status: number): Response {
  const body: ParsePropertiesResponse = { results: [], errors: [error] };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse({ sourceFile: "Fichier inconnu", code: "INVALID_FORM", message: "La requête d'import est invalide." }, 400);
  }

  const candidate = formData.get("file");
  if (!(candidate instanceof File)) {
    return errorResponse({ sourceFile: "Fichier inconnu", code: "MISSING_FILE", message: "Aucun PDF n'a été reçu." }, 400);
  }

  const safeFileName = sanitizeFileName(candidate.name);
  const validation = validatePdfMetadata(candidate);
  if (!validation.valid) {
    return errorResponse({
      sourceFile: safeFileName,
      code: validation.code ?? "INVALID_FILE",
      message: validation.message ?? "Le PDF est invalide.",
    }, 400);
  }

  try {
    const bytes = new Uint8Array(await candidate.arrayBuffer());
    if (!hasPdfMagicBytes(bytes)) {
      return errorResponse({
        sourceFile: safeFileName,
        code: "INVALID_SIGNATURE",
        message: "Le contenu reçu n'est pas un document PDF valide.",
      }, 400);
    }

    // PDF.js may transfer/detach the buffer it receives. Preserve the source page
    // before text extraction so the exact PDF bytes remain available to pdf-lib.
    let originalSourcePage: string | undefined;
    try {
      const firstPage = await extractOriginalFirstPage(bytes.slice());
      originalSourcePage = Buffer.from(firstPage).toString("base64");
    } catch {
      // Parsing remains useful for legacy or malformed PDFs even if the source
      // page cannot be retained; report generation will surface reimport guidance.
    }

    const extracted = await extractPdfContent(bytes);
    const result = parsePropertyDocument(extracted.text, {
      id: randomUUID(),
      sourceFile: safeFileName,
      pageCount: extracted.pageCount,
      detectedImageCount: extracted.detectedImageCount,
      includeDebug: process.env.NODE_ENV === "development",
    });

    if (originalSourcePage) {
      result.originalSourcePage = {
        mediaType: "application/pdf",
        pageNumber: 1,
        pdfBase64: originalSourcePage,
      };
    } else {
      result.warnings.push("La page source originale n’a pas pu être conservée.");
    }

    const body: ParsePropertiesResponse = { results: [result], errors: [] };
    return Response.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof UnsupportedPropertyDocumentError) {
      return errorResponse({
        sourceFile: safeFileName,
        code: error.code,
        message: error.message,
      }, 422);
    }
    const knownError = error instanceof PdfReadError;
    return errorResponse({
      sourceFile: safeFileName,
      code: knownError ? error.code : "PARSE_FAILED",
      message: knownError ? error.message : "La fiche n'a pas pu être analysée.",
    }, knownError && error.code === "PARSE_TIMEOUT" ? 408 : 422);
  }
}
