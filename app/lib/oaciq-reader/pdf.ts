import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFStream,
  PDFString,
} from "@cantoo/pdf-lib";
import { getDocumentProxy } from "unpdf";
import {
  cleanSpaces,
  parsePdfSignatureDate,
  parseVisibleSignatureDate,
} from "./dates";
import type {
  OaciqAnnotation,
  OaciqExtractedDocument,
  OaciqPage,
  OaciqPdfInput,
  OaciqSignature,
  OaciqWord,
} from "./types";

export const OACIQ_LIMITS = {
  files: 20,
  bytes: 40 * 1024 * 1024,
  pages: 150,
  annotations: 500,
} as const;
const options = {
  disableFontFace: true,
  useSystemFonts: false,
  isEvalSupported: false,
  maxImageSize: 16_777_216,
  verbosity: 0,
};
const name = (s: string) => PDFName.of(s);
const value = (dict: PDFDict | undefined, key: string) =>
  dict?.lookup(name(key));
function string(dict: PDFDict | undefined, key: string): string {
  const v = value(dict, key);
  return v instanceof PDFString || v instanceof PDFHexString
    ? v.decodeText()
    : v instanceof PDFName
      ? v.decodeText()
      : "";
}
function wordsAndText(
  items: { str: string; transform: number[]; width: number; height: number }[],
  height: number,
): Pick<OaciqPage, "text" | "words" | "wordsLoose"> {
  const words: OaciqWord[] = [];
  for (const item of items) {
    const size = Math.abs(item.height || item.transform[3]);
    const top = height - item.transform[5] - size * 0.8;
    for (const match of item.str.matchAll(/\S+/g)) {
      const x0 =
        item.transform[4] +
        (item.width * match.index) / Math.max(item.str.length, 1);
      const x1 =
        x0 + (item.width * match[0].length) / Math.max(item.str.length, 1);
      words.push({ text: match[0], x0, x1, top, bottom: top + size });
    }
  }
  words.sort((a, b) => a.top - b.top || a.x0 - b.x0);
  // pdfplumber's x/y tolerances join adjacent split glyph runs (common in form fields).
  function merge(tolerance: number) {
    const lines: OaciqWord[][] = [];
    for (const w of words) {
      let line = lines.find((row) => Math.abs(row[0].top - w.top) <= 3);
      if (!line) {
        line = [];
        lines.push(line);
      }
      line.push(w);
    }
    const rows = lines.map((row) => {
      const joined: OaciqWord[] = [];
      for (const word of row.sort((a, b) => a.x0 - b.x0)) {
        const previous = joined.at(-1);
        if (
          previous &&
          word.x0 >= (previous.x1 || previous.x0) - 0.5 &&
          word.x0 - (previous.x1 || previous.x0) <= tolerance &&
          Math.abs(word.top - previous.top) <= 3
        ) {
          previous.text += word.text;
          previous.x1 = word.x1;
        } else joined.push({ ...word });
      }
      return joined;
    });
    return {
      words: rows.flat(),
      text: rows.map((row) => row.map((w) => w.text).join(" ")).join("\n"),
    };
  }
  const normal = merge(1);
  return { ...normal, wordsLoose: merge(2).words };
}

/** Node-only extraction, independent of the Centris reader and of browser workers.
 * Annotation appearance streams are read as temporary in-memory PDF pages. This
 * preserves the visible signing time instead of substituting the PDF certificate
 * completion time (the source reader's critical multi-form correction). */
export async function extractOaciqPdf(
  input: OaciqPdfInput,
): Promise<OaciqExtractedDocument> {
  if (typeof window !== "undefined")
    throw new Error("Le lecteur OACIQ doit être exécuté côté serveur.");
  const bytes =
    input.data instanceof Uint8Array ? input.data : new Uint8Array(input.data);
  if (
    !bytes.length ||
    bytes.length > OACIQ_LIMITS.bytes ||
    new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-"
  )
    throw new Error("Fichier OACIQ PDF invalide ou trop volumineux.");
  const pdf = await getDocumentProxy(bytes.slice(), options);
  const result: OaciqExtractedDocument = {
    name: input.name,
    pages: [],
    signatures: [],
    annotations: [],
    signatureWidgets: [],
    ...(input.ocrPages ? { ocrPages: input.ocrPages } : {}),
  };
  try {
    if (pdf.numPages > OACIQ_LIMITS.pages)
      throw new Error("Le document OACIQ contient trop de pages.");
    if (
      input.ocrPages &&
      (input.ocrPages.length !== pdf.numPages ||
        input.ocrPages.some((p) => typeof p !== "string"))
    )
      throw new Error("Les pages OCR ne correspondent pas au PDF OACIQ.");
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i),
        viewport = page.getViewport({ scale: 1 });
      try {
        const content = await page.getTextContent({
          disableNormalization: false,
        });
        const items = content.items.filter((item) => "str" in item);
        result.pages.push({
          width: viewport.width,
          height: viewport.height,
          ...wordsAndText(items, viewport.height),
        });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await pdf.loadingTask.destroy();
  }
  if (
    !input.ocrPages &&
    result.pages.every((p) => p.text.replace(/\s/g, "").length < 20)
  )
    throw new Error(
      "PDF OACIQ numérisé : une extraction OCR est requise avant l'analyse.",
    );
  // Never flatten/save the caller's PDF. All following changes are memory-only.
  const original = await PDFDocument.load(bytes, {
    updateMetadata: false,
    password: "",
  });
  const originalPages = original.getPages();
  const appearanceJobs: {
    annotation: OaciqAnnotation;
    signature?: OaciqSignature;
    page: number;
  }[] = [];
  const seenFields = new Set<string>();
  let annotationCount = 0;
  for (const [pageIndex, page] of originalPages.entries()) {
    const annotations = page.node.Annots();
    if (!annotations) continue;
    for (const ref of annotations.asArray()) {
      if (++annotationCount > OACIQ_LIMITS.annotations)
        throw new Error("Le document OACIQ contient trop d'annotations.");
      const a = original.context.lookup(ref);
      if (!(a instanceof PDFDict)) continue;
      const parentValue = value(a, "Parent"),
        parent = parentValue instanceof PDFDict ? parentValue : undefined;
      const fieldType = string(a, "FT") || string(parent, "FT"),
        subtype = string(a, "Subtype");
      if (fieldType !== "Sig" && subtype !== "FreeText") continue;
      const rectValue = value(a, "Rect") || value(parent, "Rect");
      const rect =
        rectValue instanceof PDFArray
          ? rectValue
              .asArray()
              .map((n) => (n instanceof PDFNumber ? n.asNumber() : NaN))
          : [];
      const validRect = rect.length === 4 && rect.every(Number.isFinite);
      const [x0, y0, x1, y1] = validRect ? rect : [0, 0, 0, 0];
      const annotation: OaciqAnnotation = {
        pageIndex,
        text: "",
        x0: Math.min(x0, x1),
        x1: Math.max(x0, x1),
        top: page.getHeight() - Math.max(y0, y1),
        bottom: page.getHeight() - Math.min(y0, y1),
      };
      let signature: OaciqSignature | undefined;
      if (fieldType === "Sig") {
        if (validRect && x0 !== x1 && y0 !== y1)
          result.signatureWidgets.push(annotation);
        const field = string(a, "T") || string(parent, "T"),
          sig = value(a, "V") || value(parent, "V");
        if (
          sig instanceof PDFDict &&
          string(sig, "Type") === "Sig" &&
          !seenFields.has(field)
        ) {
          seenFields.add(field);
          const contact = string(sig, "ContactInfo"),
            certificateSignedAt = parsePdfSignatureDate(string(sig, "M"));
          signature = {
            field,
            name: cleanSpaces(
              contact.split(" IP:")[0].replaceAll("eZsign", ""),
            ),
            contact,
            reason: string(sig, "Reason"),
            signedAt: certificateSignedAt,
            certificateSignedAt,
            pageIndex,
            ...(validRect && x0 !== x1 && y0 !== y1 ? annotation : {}),
          };
          result.signatures.push(signature);
        }
      } else if (validRect) result.annotations.push(annotation);
      const ap = value(a, "AP") || value(parent, "AP");
      let stream = ap instanceof PDFDict ? value(ap, "N") : undefined;
      if (stream instanceof PDFDict) {
        const state = string(a, "AS") || string(parent, "AS");
        stream = state ? value(stream, state) : undefined;
      }
      if (!(stream instanceof PDFStream)) continue;
      const appearancePage = original.addPage([
        page.getWidth(),
        page.getHeight(),
      ]);
      appearancePage.node.setXObject(
        name("OaciqAppearance"),
        original.context.register(stream),
      );
      appearancePage.node.addContentStream(
        original.context.register(
          original.context.flateStream("q /OaciqAppearance Do Q"),
        ),
      );
      appearanceJobs.push({
        annotation,
        signature,
        page: original.getPageCount(),
      });
    }
  }
  // Signature fields may have no visible widget (certificate-only signatures).
  const acroform = value(original.catalog, "AcroForm");
  const visitedFields = new Set<PDFDict>();
  const visitFields = (
    fields: PDFArray | undefined,
    prefix = "",
    depth = 0,
  ) => {
    if (depth > 50) throw new Error("Structure de champs OACIQ trop profonde.");
    if (!fields) return;
    for (const ref of fields.asArray()) {
      const field = original.context.lookup(ref);
      if (!(field instanceof PDFDict) || visitedFields.has(field)) continue;
      visitedFields.add(field);
      if (visitedFields.size > OACIQ_LIMITS.annotations)
        throw new Error("Le document OACIQ contient trop de champs.");
      const fieldName = [prefix, string(field, "T")].filter(Boolean).join(".");
      const sig = value(field, "V");
      if (
        string(field, "FT") === "Sig" &&
        sig instanceof PDFDict &&
        string(sig, "Type") === "Sig" &&
        !seenFields.has(fieldName)
      ) {
        seenFields.add(fieldName);
        const contact = string(sig, "ContactInfo"),
          signedAt = parsePdfSignatureDate(string(sig, "M"));
        result.signatures.push({
          field: fieldName,
          name: cleanSpaces(contact.split(" IP:")[0].replaceAll("eZsign", "")),
          contact,
          reason: string(sig, "Reason"),
          signedAt,
          certificateSignedAt: signedAt,
        });
      }
      const kids = value(field, "Kids");
      if (kids instanceof PDFArray) visitFields(kids, fieldName, depth + 1);
    }
  };
  const fields =
    acroform instanceof PDFDict ? value(acroform, "Fields") : undefined;
  visitFields(fields instanceof PDFArray ? fields : undefined);
  if (appearanceJobs.length) {
    const appearances = await getDocumentProxy(
      await original.save({ updateFieldAppearances: false }),
      options,
    );
    try {
      for (const job of appearanceJobs) {
        const page = await appearances.getPage(job.page);
        try {
          const content = await page.getTextContent();
          job.annotation.text = cleanSpaces(
            content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" "),
          );
          if (job.signature) {
            job.signature.text = job.annotation.text;
            job.signature.visibleSignedAt = parseVisibleSignatureDate(
              job.annotation.text,
            );
            job.signature.signedAt =
              job.signature.visibleSignedAt ||
              job.signature.certificateSignedAt ||
              null;
          }
        } finally {
          page.cleanup();
        }
      }
    } finally {
      await appearances.loadingTask.destroy();
    }
  }
  return result;
}
