import type { ReportDocumentData, ReportPdfOptions } from "./types";
import { composeFinalReportPdf } from "./pdf/merge-pdfs";
import type { PdfCompositionResult } from "./pdf/merge-pdfs";
import { createClassicReportPdf } from "./templates/classic";

export async function generateAcmReportPart(data: ReportDocumentData, options?: ReportPdfOptions): Promise<Uint8Array> {
  if (data.template === "classic") return createClassicReportPdf(data, options);
  throw new Error(`Modèle de rapport non pris en charge: ${data.template}`);
}

export async function generateFinalReport(data: ReportDocumentData, teamPresentationPdf: Uint8Array, options?: ReportPdfOptions): Promise<Uint8Array> {
  return (await generateFinalReportWithWarnings(data, teamPresentationPdf, options)).pdf;
}

export async function generateFinalReportWithWarnings(data: ReportDocumentData, teamPresentationPdf: Uint8Array, options?: ReportPdfOptions): Promise<PdfCompositionResult> {
  const acmPdf = await generateAcmReportPart(data, options);
  return composeFinalReportPdf(acmPdf, data.subject.property, data.comparables, teamPresentationPdf);
}
