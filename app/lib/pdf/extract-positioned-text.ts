export type PositionedPDFTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
};

export type PositionedPDFPage = {
  pageNumber: number;
  width: number;
  height: number;
  text: string;
  items: PositionedPDFTextItem[];
};

export type PositionedPDFText = {
  pageCount: number;
  pages: PositionedPDFPage[];
};

export class PositionedPDFError extends Error {
  constructor(
    public readonly code: "invalid_pdf" | "no_text" | "pdf_runtime_error",
    message: string,
    public readonly pageCount = 0,
    public readonly stage = "unknown",
  ) {
    super(message);
    this.name = "PositionedPDFError";
  }
}

type PDFTextItem = {
  str: string;
  transform: number[];
  width: number;
};

function isTextItem(value: unknown): value is PDFTextItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PDFTextItem>;
  return typeof item.str === "string"
    && Array.isArray(item.transform)
    && typeof item.transform[4] === "number"
    && typeof item.transform[5] === "number"
    && typeof item.width === "number";
}

function runtimeError(error: unknown, stage: string, pageCount = 0) {
  const name = error instanceof Error ? error.name.slice(0, 80) : "UnknownError";
  return new PositionedPDFError(
    "pdf_runtime_error",
    `Le document PDF n’a pas pu être analysé (${name}).`,
    pageCount,
    stage,
  );
}

export async function extractPositionedTextFromPDF(data: Uint8Array): Promise<PositionedPDFText> {
  if (data.length < 5 || new TextDecoder("ascii").decode(data.subarray(0, 5)) !== "%PDF-") {
    throw new PositionedPDFError("invalid_pdf", "Le fichier fourni n’est pas un PDF valide.", 0, "signature");
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

  const pages: PositionedPDFPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber).catch((error: unknown) => {
        throw runtimeError(error, "page-load", pages.length);
      });
      try {
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent({ disableNormalization: false });
        const items = content.items.flatMap((item): PositionedPDFTextItem[] => {
          if (!isTextItem(item)) return [];
          const text = item.str.trim();
          return text ? [{ text, x: item.transform[4], y: item.transform[5], width: item.width }] : [];
        });
        pages.push({
          pageNumber,
          width: viewport.width,
          height: viewport.height,
          text: items.map((item) => item.text).join(" "),
          items,
        });
      } catch (error) {
        if (error instanceof PositionedPDFError) throw error;
        throw runtimeError(error, "text-content", pages.length);
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await document.cleanup();
  }

  if (!pages.some((page) => page.text.replace(/\s/g, "").length >= 20)) {
    throw new PositionedPDFError(
      "no_text",
      "Ce PDF ne contient aucun texte lisible. Utilisez le formulaire PDF original, sans numérisation.",
      pages.length,
      "text-layer",
    );
  }

  return { pageCount: pages.length, pages };
}
