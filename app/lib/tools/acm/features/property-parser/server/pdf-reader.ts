import "server-only";

import { getDocumentProxy, getResolvedPDFJS } from "unpdf";
import { MAX_PDF_PAGES, PDF_PARSE_TIMEOUT_MS } from "../constants";

export interface ExtractedPdfContent {
  text: string;
  pageCount: number;
  detectedImageCount: number;
}

export class PdfReadError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PdfReadError";
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PdfReadError("PARSE_TIMEOUT", "Le délai de lecture du PDF a été dépassé.")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function detectImages(pdf: Awaited<ReturnType<typeof getDocumentProxy>>): Promise<number> {
  const { OPS } = await getResolvedPDFJS();
  const imageOperations = new Set([
    OPS.paintImageXObject,
    OPS.paintImageMaskXObject,
    OPS.paintInlineImageXObject,
    OPS.paintSolidColorImageMask,
  ]);
  let count = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const operators = await page.getOperatorList();
    count += operators.fnArray.filter((operation) => imageOperations.has(operation)).length;
    page.cleanup();
  }

  return count;
}

interface PositionedTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isPositionedTextItem(item: unknown): item is PositionedTextItem {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Partial<PositionedTextItem>;
  return typeof candidate.str === "string"
    && Array.isArray(candidate.transform)
    && candidate.transform.length >= 6
    && typeof candidate.width === "number"
    && typeof candidate.height === "number";
}

/**
 * PDF.js returns text in content-stream order, which is not visual reading order
 * for Centris' two-column sheets. Rebuild visual lines from item coordinates before
 * giving the text to the parser. Tabs intentionally preserve large column gaps.
 */
export function reconstructPageText(items: readonly unknown[]): string {
  const textItems = items.filter(isPositionedTextItem).filter(({ str }) => str.trim().length > 0);
  const lines: Array<{ y: number; items: PositionedTextItem[] }> = [];

  for (const item of textItems) {
    const y = item.transform[5];
    const tolerance = Math.max(1.5, item.height * 0.3);
    const line = lines.find((candidate) => Math.abs(candidate.y - y) <= tolerance);
    if (line) {
      line.items.push(item);
      line.y = (line.y * (line.items.length - 1) + y) / line.items.length;
    } else {
      lines.push({ y, items: [item] });
    }
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => {
      const sorted = [...line.items].sort((left, right) => left.transform[4] - right.transform[4]);
      let output = "";
      let previousEnd: number | undefined;

      for (const item of sorted) {
        const x = item.transform[4];
        if (output && previousEnd !== undefined) {
          const gap = x - previousEnd;
          output += gap > Math.max(12, item.height * 1.5) ? "\t" : " ";
        }
        output += item.str.trim();
        previousEnd = x + item.width;
      }

      return output.trim();
    })
    .filter(Boolean)
    .join("\n");
}

async function extractPositionedText(pdf: Awaited<ReturnType<typeof getDocumentProxy>>): Promise<string> {
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({ disableNormalization: false });
    pages.push(reconstructPageText(content.items));
    page.cleanup();
  }
  return pages.join("\n");
}

export async function extractPdfContent(bytes: Uint8Array): Promise<ExtractedPdfContent> {
  const pdf = await withTimeout(
    getDocumentProxy(bytes, {
      disableAutoFetch: true,
      disableStream: true,
      maxImageSize: 16_777_216,
      useWasm: false,
    }),
    PDF_PARSE_TIMEOUT_MS,
  );

  try {
    if (pdf.numPages < 1 || pdf.numPages > MAX_PDF_PAGES) {
      throw new PdfReadError("INVALID_PAGE_COUNT", `Le PDF doit contenir entre 1 et ${MAX_PDF_PAGES} pages.`);
    }

    const [text, detectedImageCount] = await withTimeout(
      Promise.all([
        extractPositionedText(pdf),
        detectImages(pdf),
      ]),
      PDF_PARSE_TIMEOUT_MS,
    );

    return { text, pageCount: pdf.numPages, detectedImageCount };
  } catch (error) {
    if (error instanceof PdfReadError) throw error;
    throw new PdfReadError("UNREADABLE_PDF", "Le contenu du PDF n'a pas pu être lu.");
  } finally {
    await pdf.loadingTask.destroy();
  }
}
