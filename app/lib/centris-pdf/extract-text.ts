import { CentrisPDFError, type ExtractedPDFText } from "./types";

type PDFTextItem = {
  str: string;
  transform: number[];
  width: number;
  hasEOL?: boolean;
};

function isTextItem(value: unknown): value is PDFTextItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PDFTextItem>;
  return typeof item.str === "string" && Array.isArray(item.transform);
}

function pageTextFromItems(items: unknown[]) {
  return items
    .filter(isTextItem)
    .map((item) => item.str.trim())
    .filter(Boolean)
    .join(" ");
}

function runtimeErrorName(error: unknown) {
  return error instanceof Error && error.name ? error.name.slice(0, 80) : "UnknownError";
}

function runtimeError(error: unknown, stage: string, pageCount = 0) {
  return new CentrisPDFError(
    "pdf_runtime_error",
    "Cette fiche PDF n’a pas pu être analysée.",
    pageCount,
    stage,
    runtimeErrorName(error),
  );
}

export async function extractTextFromPDF(data: Uint8Array): Promise<ExtractedPDFText> {
  if (data.length < 5 || new TextDecoder("ascii").decode(data.subarray(0, 5)) !== "%PDF-") {
    throw new CentrisPDFError("invalid_pdf", "Le fichier fourni n’est pas un PDF valide.", 0, "signature");
  }
  let getDocumentProxy: typeof import("unpdf")["getDocumentProxy"];
  try {
    ({ getDocumentProxy } = await import("unpdf"));
  } catch (error) {
    throw runtimeError(error, "pdf-runtime-import");
  }

  let document: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    document = await getDocumentProxy(data, {
      disableFontFace: true,
      maxImageSize: 16_777_216,
      useSystemFonts: false,
    });
  } catch (error) {
    throw runtimeError(error, "document-load");
  }

  const pages: ExtractedPDFText["pages"] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      let page;
      try {
        page = await document.getPage(pageNumber);
      } catch (error) {
        throw runtimeError(error, "page-load", pages.length);
      }
      try {
        const content = await page.getTextContent({ disableNormalization: false });
        pages.push({ pageNumber, text: pageTextFromItems(content.items) });
      } catch (error) {
        throw runtimeError(error, "text-content", pages.length);
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await document.cleanup();
  }

  if (!pages.some((page) => page.text.replace(/\s/g, "").length >= 20)) {
    throw new CentrisPDFError(
      "no_text",
      "Cette fiche PDF ne contient aucun texte lisible. Utilisez une fiche Centris exportée directement en PDF.",
      pages.length,
      "text-layer",
    );
  }
  return { pageCount: pages.length, pages };
}
