import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractPdfContent } from "@/app/lib/tools/acm/features/property-parser/server/pdf-reader";
import { createReportFixture } from "./report-test-fixtures";
import { prepareReportDocumentData } from "./prepare-report-data";
import { generateAcmReportPart } from "./generate-report";

describe("préparateur de la brochure", () => {
  it.each([
    ["maxime", "Maxime"],
    ["sandrine", "Sandrine"],
    ["france", "France"],
  ] as const)("inscrit %s dans la couverture et les métadonnées PDF", async (preparedBy, displayName) => {
    const report = createReportFixture();
    report.preparedBy = preparedBy;
    const pdf = await generateAcmReportPart(prepareReportDocumentData(report));
    const document = await PDFDocument.load(pdf);
    const text = (await extractPdfContent(pdf)).text;
    expect(text).toContain("PRÉPARÉE PAR");
    expect(text).toContain(displayName);
    expect(document.getAuthor()).toBe(`${displayName} - Équipe Forbes Team`);
    if (preparedBy !== "maxime") {
      expect(text).not.toContain("Maxime Cyr");
      expect(text).not.toContain("Courtier immobilier résidentiel");
    }
  });
});
