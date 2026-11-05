import { PDFDocument } from "pdf-lib";
import type { ParsedProperty } from "@/app/lib/tools/acm/types";
import type { ReportComparableSection } from "../types";

export interface PdfCompositionResult {
  pdf: Uint8Array;
  warnings: string[];
}

interface ReportSourceProperty {
  property: ParsedProperty;
  role: "subject" | "comparable";
}

export async function mergePdfDocuments(primaryPdf: Uint8Array, appendixPdf: Uint8Array): Promise<Uint8Array> {
  const output = await PDFDocument.load(primaryPdf);
  const appendix = await PDFDocument.load(appendixPdf);
  const pages = await output.copyPages(appendix, appendix.getPageIndices());
  pages.forEach((page) => output.addPage(page));
  return output.save({ useObjectStreams: true });
}

function missingSourceWarning({ property, role }: ReportSourceProperty): string {
  const label = role === "subject" ? "de la propriété sujet" : "du comparable";
  return `La fiche source ${label} ${property.data.address ?? property.sourceFile} doit être réimportée pour être intégrée à la brochure.`;
}

export function collectReportSourceProperties(
  subject: ParsedProperty,
  comparables: ReportComparableSection[],
): ReportSourceProperty[] {
  const candidates: ReportSourceProperty[] = [
    { property: subject, role: "subject" },
    ...comparables
      .filter(({ analysis }) => analysis.included)
      .map(({ property }) => ({ property, role: "comparable" as const })),
  ];
  const seenPropertyIds = new Set<string>();
  return candidates.filter(({ property }) => {
    if (seenPropertyIds.has(property.id)) return false;
    seenPropertyIds.add(property.id);
    return true;
  });
}

export async function composeFinalReportPdf(
  acmPdf: Uint8Array,
  subject: ParsedProperty,
  comparables: ReportComparableSection[],
  teamPresentationPdf: Uint8Array,
): Promise<PdfCompositionResult> {
  const output = await PDFDocument.load(acmPdf);
  const warnings: string[] = [];

  for (const sourceProperty of collectReportSourceProperties(subject, comparables)) {
    const { property } = sourceProperty;
    if (property.sourceType === "manual") continue;
    if ((property.documentType !== "centris" && property.documentType !== "jlr") || !property.originalSourcePage?.pdfBase64) {
      warnings.push(missingSourceWarning(sourceProperty));
      continue;
    }

    try {
      const source = await PDFDocument.load(Buffer.from(property.originalSourcePage.pdfBase64, "base64"));
      if (source.getPageCount() === 0) throw new Error("PDF sans page");
      const [firstPage] = await output.copyPages(source, [0]);
      output.addPage(firstPage);
    } catch {
      warnings.push(missingSourceWarning(sourceProperty));
    }
  }

  const teamPresentation = await PDFDocument.load(teamPresentationPdf);
  const teamPages = await output.copyPages(teamPresentation, teamPresentation.getPageIndices());
  teamPages.forEach((page) => output.addPage(page));

  return { pdf: await output.save({ useObjectStreams: true }), warnings };
}
