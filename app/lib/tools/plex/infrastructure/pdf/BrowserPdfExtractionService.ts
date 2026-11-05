import { parseCentrisPages } from "./centris-parser";
import type { CentrisExtraction, PdfTextPage } from "./centris-types";

type PdfProgressCallback = (percentage: number) => void;



export async function extractCentrisPdf(file: File, onProgress?: PdfProgressCallback): Promise<CentrisExtraction> {
  onProgress?.(0);
  const bytes = await file.arrayBuffer();
  onProgress?.(5);
  return extractCentrisPdfBytes(bytes, file.name, (percentage) => {
    onProgress?.(5 + Math.round(percentage * 0.95));
  });
}

export async function extractCentrisPdfBytes(file: ArrayBuffer, fileName: string, onProgress?: PdfProgressCallback): Promise<CentrisExtraction> {
  onProgress?.(0);
  const pages = await extractPdfTextPages(file, (percentage) => {
    onProgress?.(Math.round(percentage * 0.9));
  });
  onProgress?.(95);
  const extraction = parseCentrisPages(pages, fileName);
  onProgress?.(100);
  return extraction;
}

export async function extractPdfTextPages(file: ArrayBuffer, onProgress?: PdfProgressCallback): Promise<PdfTextPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  }
  onProgress?.(5);
  const document = await pdfjs.getDocument({ data: new Uint8Array(file) }).promise;
  onProgress?.(10);
  const pages: PdfTextPage[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}` : ""))
      .join("")
      .replace(/\s{2,}/g, " ");
    pages.push({ page: pageNumber, text });
    onProgress?.(10 + Math.round((pageNumber / document.numPages) * 90));
  }
  return pages;
}
