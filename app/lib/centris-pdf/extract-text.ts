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

export async function extractTextFromPDF(data: Uint8Array): Promise<ExtractedPDFText> {
  if (data.length < 5 || new TextDecoder("ascii").decode(data.subarray(0, 5)) !== "%PDF-") {
    throw new CentrisPDFError("invalid_pdf", "Le fichier fourni n’est pas un PDF valide.", 0, "signature");
  }
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
    });
    const document = await loadingTask.promise;
    const pages: ExtractedPDFText["pages"] = [];
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent({ disableNormalization: false });
        pages.push({ pageNumber, text: pageTextFromItems(content.items) });
        page.cleanup();
      }
    } finally {
      await loadingTask.destroy();
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
  } catch (error) {
    if (error instanceof CentrisPDFError) throw error;
    throw new CentrisPDFError("unsupported_pdf", "Le PDF n’a pas pu être lu.", 0, "pdfjs");
  }
}
