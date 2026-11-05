import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractPdfContent } from "@/app/lib/tools/acm/features/property-parser/server/pdf-reader";
import { generateAcmReportPart } from "../generate-report";
import { prepareReportDocumentData } from "../prepare-report-data";
import { createReportFixture } from "../report-test-fixtures";
import { createValidatedGoogleLocation } from "@/app/lib/tools/acm/features/maps/geocoding";
import type { GoogleStaticMapRequest } from "./static-map";

const TILE_PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));

function reportWithMap() {
  const report = createReportFixture({ comparableCount: 2 });
  report.subject.data.address = "249 14e Avenue";
  Object.assign(report.subject.data, createValidatedGoogleLocation({ address: "249 14e Avenue", city: report.subject.data.city }, { coordinates: { latitude: 45.54, longitude: -73.91 }, formattedAddress: "249 14e Avenue, Deux-Montagnes, QC, Canada", placeId: "place-subject" }, "249 14e Avenue, Deux-Montagnes, QC, Canada"));
  report.comparables[0].property.data.address = "27 11e Avenue";
  Object.assign(report.comparables[0].property.data, createValidatedGoogleLocation({ address: "27 11e Avenue", city: report.comparables[0].property.data.city }, { coordinates: { latitude: 45.53, longitude: -73.89 }, formattedAddress: "27 11e Avenue, Deux-Montagnes, QC, Canada", placeId: "place-one" }, "27 11e Avenue, Deux-Montagnes, QC, Canada"));
  report.comparables[1].property.data.address = "932 Rue Blouin";
  Object.assign(report.comparables[1].property.data, createValidatedGoogleLocation({ address: "932 Rue Blouin", city: report.comparables[1].property.data.city }, { coordinates: { latitude: 45.55, longitude: -73.87 }, formattedAddress: "932 Rue Blouin, Deux-Montagnes, QC, Canada", placeId: "place-two" }, "932 Rue Blouin, Deux-Montagnes, QC, Canada"));
  return prepareReportDocumentData(report);
}

describe("page de carte statique", () => {
  it("ajoute une carte nette avec le sujet, les numéros et la légende", async () => {
    const loader = vi.fn(async (request: GoogleStaticMapRequest) => {
      void request;
      return TILE_PNG;
    });
    const pdf = await generateAcmReportPart(reportWithMap(), { mapApiKey: "test-key", mapImageLoader: loader });
    const document = await PDFDocument.load(pdf);
    const mapPage = await PDFDocument.create();
    const [page] = await mapPage.copyPages(document, [document.getPageCount() - 1]);
    mapPage.addPage(page);
    const text = (await extractPdfContent(await mapPage.save())).text;
    expect(text).toMatch(/Carte des comparables/i);
    expect(text).toMatch(/249 14e Avenue/i);
    expect(text).toMatch(/Comparable 1/i);
    expect(text).toMatch(/27 11e Avenue/i);
    expect(text).toMatch(/Comparable 2/i);
    expect(text).toMatch(/932 Rue Blouin/i);
    expect(loader).toHaveBeenCalledOnce();
    const requestUrl = new URL(loader.mock.calls[0][0].url);
    expect(requestUrl.searchParams.getAll("markers")).toHaveLength(3);
  });

  it("continue avec une page de repli lorsque les tuiles sont indisponibles", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pdf = await generateAcmReportPart(reportWithMap(), {
      mapApiKey: "test-key",
      mapImageLoader: async () => { throw new Error("offline"); },
    });
    const document = await PDFDocument.load(pdf);
    const mapPage = await PDFDocument.create();
    const [page] = await mapPage.copyPages(document, [document.getPageCount() - 1]);
    mapPage.addPage(page);
    expect((await extractPdfContent(await mapPage.save())).text).toMatch(/Carte temporairement indisponible/i);
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it("retire un comparable exclu et signale une propriété manuelle sans coordonnées", async () => {
    const report = createReportFixture({ comparableCount: 3 });
    Object.assign(report.subject.data, createValidatedGoogleLocation({ address: report.subject.data.address!, city: report.subject.data.city }, { coordinates: { latitude: 45.54, longitude: -73.91 }, formattedAddress: "Sujet, QC, Canada", placeId: "place-subject" }, "Sujet, QC, Canada"));
    Object.assign(report.comparables[0].property.data, createValidatedGoogleLocation({ address: report.comparables[0].property.data.address!, city: report.comparables[0].property.data.city }, { coordinates: { latitude: 45.53, longitude: -73.89 }, formattedAddress: "Comparable, QC, Canada", placeId: "place-one" }, "Comparable, QC, Canada"));
    report.comparables[1].property.data.address = "Adresse exclue";
    report.comparables[1].property.data.coordinates = { latitude: 45.55, longitude: -73.87 };
    report.comparables[1].analysis.included = false;
    report.comparables[2].property.sourceType = "manual";
    report.comparables[2].property.data.address = "Propriété manuelle";
    report.comparables[2].property.data.coordinates = undefined;

    const pdf = await generateAcmReportPart(prepareReportDocumentData(report), { mapApiKey: "test-key", mapImageLoader: async () => TILE_PNG });
    const document = await PDFDocument.load(pdf);
    const mapPage = await PDFDocument.create();
    const [page] = await mapPage.copyPages(document, [document.getPageCount() - 1]);
    mapPage.addPage(page);
    const text = (await extractPdfContent(await mapPage.save())).text;
    expect(text).not.toMatch(/Adresse exclue/i);
    expect(text).toMatch(/Propriété manuelle/i);
    expect(text).toMatch(/Localisation non disponible/i);
    expect(text).toMatch(/Comparable 2/i);
    expect(text).not.toMatch(/Comparable 3/i);
  });
});
