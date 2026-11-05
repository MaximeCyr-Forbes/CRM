import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractPdfContent } from "@/app/lib/tools/acm/features/property-parser/server/pdf-reader";
import { generateAcmReportPart, generateFinalReport } from "./generate-report";
import { mergePdfDocuments } from "./pdf/merge-pdfs";
import { A4_HEIGHT, A4_WIDTH } from "./pdf/pdf-utils";
import { prepareReportDocumentData } from "./prepare-report-data";
import { createReportFixture } from "./report-test-fixtures";

async function onePagePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage();
  return document.save();
}

describe("génération et fusion PDF", () => {
  it("génère une brochure avec un comparable", async () => {
    const pdf = await generateAcmReportPart(prepareReportDocumentData(createReportFixture({ comparableCount: 1 })));
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBe(7);
  });

  it("gère plusieurs comparables et pagine le tableau", async () => {
    const pdf = await generateAcmReportPart(prepareReportDocumentData(createReportFixture({ comparableCount: 4 })));
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBe(11);
    expect(document.getPage(7).getSize()).toEqual({ width: A4_WIDTH, height: A4_HEIGHT });
    expect(document.getPage(8).getSize()).toEqual({ width: A4_WIDTH, height: A4_HEIGHT });
  });

  it("génère la comparaison en A4 portrait avec des années non groupées", async () => {
    const fixture = createReportFixture({ comparableCount: 3 });
    fixture.subject.data.yearBuilt = 1988;
    [1991, 1930, 1987].forEach((year, index) => {
      fixture.comparables[index].property.data.yearBuilt = year;
    });
    const pdf = await generateAcmReportPart(prepareReportDocumentData(fixture));
    const document = await PDFDocument.load(pdf);
    const comparisonPageIndex = 6;
    expect(document.getPage(comparisonPageIndex).getSize()).toEqual({ width: A4_WIDTH, height: A4_HEIGHT });

    const comparisonOnly = await PDFDocument.create();
    const [comparisonPage] = await comparisonOnly.copyPages(document, [comparisonPageIndex]);
    comparisonOnly.addPage(comparisonPage);
    const text = (await extractPdfContent(await comparisonOnly.save())).text;
    expect(text).toMatch(/Comparaison des propriétés/i);
    expect(text).toMatch(/1988/);
    expect(text).toMatch(/1991/);
    expect(text).toMatch(/1930/);
    expect(text).toMatch(/1987/);
    expect(text).not.toMatch(/1 988|1 991|1 930|1 987/);
  });

  it("génère sans photo ni commentaire du courtier", async () => {
    const pdf = await generateAcmReportPart(prepareReportDocumentData(createReportFixture({ withoutPhotos: true, withoutComment: true })));
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(0);
  });

  it("fusionne deux PDF sans rasteriser leurs pages", async () => {
    const merged = await mergePdfDocuments(await onePagePdf(), await onePagePdf());
    expect((await PDFDocument.load(merged)).getPageCount()).toBe(2);
  });

  it("joint les 12 pages originales de la présentation Forbes à la fin", async () => {
    const prepared = prepareReportDocumentData(createReportFixture({ comparableCount: 1 }));
    const acm = await generateAcmReportPart(prepared);
    const acmPages = (await PDFDocument.load(acm)).getPageCount();
    const teamPdf = await readFile(path.join(process.cwd(), "app", "lib", "tools", "acm", "features", "reports", "assets", "equipe-forbes-presentation.pdf"));
    const teamPages = (await PDFDocument.load(teamPdf)).getPageCount();
    const final = await generateFinalReport(prepared, teamPdf);
    expect(teamPages).toBe(12);
    expect((await PDFDocument.load(final)).getPageCount()).toBe(acmPages + teamPages);
  }, 20_000);
});
