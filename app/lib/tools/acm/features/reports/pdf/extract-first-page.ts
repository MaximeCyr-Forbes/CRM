import { PDFDocument } from "pdf-lib";

export async function extractOriginalFirstPage(sourcePdf: Uint8Array): Promise<Uint8Array> {
  const source = await PDFDocument.load(sourcePdf);
  if (source.getPageCount() === 0) throw new Error("Le PDF source ne contient aucune page.");

  const output = await PDFDocument.create();
  const [firstPage] = await output.copyPages(source, [0]);
  output.addPage(firstPage);
  return output.save({ useObjectStreams: true });
}
