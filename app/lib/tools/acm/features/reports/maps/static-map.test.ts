import { describe, expect, it, vi } from "vitest";
import { createAnalysisSnapshot, deserializeAnalysisSnapshot } from "@/app/lib/tools/acm/features/analyses/serialization";
import { createCmaWorkspaceState, prepareCmaReportData } from "@/app/lib/tools/acm/features/comparables";
import { createValidatedGoogleLocation } from "@/app/lib/tools/acm/features/maps/geocoding";
import { prepareReportDocumentData } from "../prepare-report-data";
import { createReportFixture } from "../report-test-fixtures";
import { createGoogleStaticMapRequest, createProtectedStaticMapImageLoader, createReportMapEntries } from "./static-map";
import type { GoogleMapsUsageStore } from "@/app/lib/tools/acm/features/maps/server/usage-protection";

function assignGeo(property: ReturnType<typeof createReportFixture>["subject"], index: number) {
  const input = { address: property.data.address!, city: property.data.city, postalCode: property.data.postalCode };
  Object.assign(property.data, createValidatedGoogleLocation(
    input,
    {
      coordinates: { latitude: 45.52 + index * 0.012, longitude: -73.91 + index * 0.015 },
      formattedAddress: `${property.data.address}, ${property.data.city}, QC, Canada`,
      placeId: `google-place-${index}`,
    },
    `${property.data.address}, ${property.data.city}, QC, Canada`,
    "2026-09-01T13:00:00.000Z",
  ));
}

function preparedWithCoordinates(comparableCount: number) {
  const report = createReportFixture({ comparableCount });
  const properties = [report.subject, ...report.comparables.map(({ property }) => property)];
  properties.forEach(assignGeo);
  return prepareReportDocumentData(report);
}

describe("données Google Static Map", () => {
  it("numérote le sujet et les comparables dans l’ordre de l’ACM", () => {
    const entries = createReportMapEntries(preparedWithCoordinates(2));
    expect(entries.map(({ property, markerLabel }) => [property.id, markerLabel])).toEqual([
      ["subject", "S"],
      ["comparable-1", "1"],
      ["comparable-2", "2"],
    ]);
    const request = createGoogleStaticMapRequest(entries, { apiKey: "test-key" })!;
    const markers = new URL(request.url).searchParams.getAll("markers");
    expect(markers).toHaveLength(3);
    expect(markers[0]).toContain("label:S");
    expect(markers[1]).toContain("label:1");
    expect(markers[2]).toContain("label:2");
  });

  it("transmet exactement les coordonnées Google sauvegardées et laisse Google cadrer tous les marqueurs", () => {
    const entries = createReportMapEntries(preparedWithCoordinates(5));
    const request = createGoogleStaticMapRequest(entries, { apiKey: "test-key" })!;
    const url = new URL(request.url);
    expect(url.searchParams.has("center")).toBe(false);
    expect(url.searchParams.has("zoom")).toBe(false);
    expect(url.searchParams.getAll("markers").join("|")).toContain("45.52,-73.91");
    expect(url.searchParams.getAll("markers")).toHaveLength(6);
    expect(url.searchParams.get("size")).toBe("640x425");
    expect(url.searchParams.get("scale")).toBe("2");
  });

  it("omet un comparable exclu sans renuméroter de travers", () => {
    const data = preparedWithCoordinates(3);
    data.comparables[1].analysis.included = false;
    const entries = createReportMapEntries(data);
    expect(entries.map(({ property, markerLabel }) => [property.id, markerLabel])).toEqual([
      ["subject", "S"],
      ["comparable-1", "1"],
      ["comparable-3", "2"],
    ]);
  });

  it("accepte un sujet JLR, des comparables Centris et une propriété manuelle", () => {
    const data = preparedWithCoordinates(3);
    data.subject.property.documentType = "jlr";
    data.comparables[0].property.documentType = "centris";
    data.comparables[1].property.documentType = "centris";
    data.comparables[2].property.sourceType = "manual";
    expect(createReportMapEntries(data)).toHaveLength(4);
  });

  it("reflète un changement d’ordre sans modifier les coordonnées", () => {
    const data = preparedWithCoordinates(3);
    const originalCoordinates = data.comparables[2].property.data.geo;
    data.comparables = [data.comparables[2], data.comparables[0], data.comparables[1]];
    const entries = createReportMapEntries(data).slice(1);
    expect(entries.map(({ property, markerLabel }) => [property.id, markerLabel])).toEqual([
      ["comparable-3", "1"],
      ["comparable-1", "2"],
      ["comparable-2", "3"],
    ]);
    expect(entries[0].coordinates).toEqual({ latitude: originalCoordinates!.latitude, longitude: originalCoordinates!.longitude });
  });

  it("conserve tout le geo Google après sauvegarde et rechargement", () => {
    const report = createReportFixture({ comparableCount: 2 });
    const properties = [report.subject, ...report.comparables.map(({ property }) => property)];
    properties.forEach(assignGeo);
    const restored = deserializeAnalysisSnapshot(JSON.parse(JSON.stringify(
      createAnalysisSnapshot(properties, createCmaWorkspaceState(properties.map(({ id }) => id))),
    )));
    const restoredReport = prepareCmaReportData(restored.properties[0], restored.properties.slice(1), {}, report.opinion);
    expect(restored.properties.map(({ data }) => data.geo)).toEqual(properties.map(({ data }) => data.geo));
    expect(createReportMapEntries(prepareReportDocumentData(restoredReport)).map(({ coordinates }) => coordinates)).toEqual(
      properties.map(({ data }) => data.geo && ({ latitude: data.geo.latitude, longitude: data.geo.longitude })),
    );
  });

  it("ne déclenche aucune Static Map pendant sauvegarde, rechargement ou réordonnancement", () => {
    const fetcher = vi.fn();
    const store: GoogleMapsUsageStore = {
      getGeocodingCache: async () => null,
      putGeocodingCache: async () => undefined,
      recordCacheEvent: async () => undefined,
      reserve: async () => ({ allowed: true, reason: null }),
      recordResult: async () => undefined,
    };
    createProtectedStaticMapImageLoader({ fetcher, store });
    const report = createReportFixture({ comparableCount: 2 });
    const properties = [report.subject, ...report.comparables.map(({ property }) => property)];
    const snapshot = createAnalysisSnapshot(properties, createCmaWorkspaceState(properties.map(({ id }) => id)));
    const restored = deserializeAnalysisSnapshot(JSON.parse(JSON.stringify(snapshot)));
    restored.workspaceState.selection.comparableIds.reverse();
    prepareReportDocumentData(prepareCmaReportData(restored.properties[0], restored.properties.slice(1), {}, report.opinion));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("ne construit aucune requête sans clé, sans coordonnées ou pour une propriété impossible", () => {
    const entries = createReportMapEntries(prepareReportDocumentData(createReportFixture({ comparableCount: 2 })));
    expect(entries.every(({ coordinates }) => coordinates === null)).toBe(true);
    expect(createGoogleStaticMapRequest(entries, { apiKey: "test-key" })).toBeNull();
    expect(createGoogleStaticMapRequest(createReportMapEntries(preparedWithCoordinates(1)), { apiKey: "" })).toBeNull();
  });

  it("compte une seule génération statique et bloque avant Google lorsque la limite est atteinte", async () => {
    const request = createGoogleStaticMapRequest(createReportMapEntries(preparedWithCoordinates(1)), { apiKey: "test-key" })!;
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } }));
    const baseStore: GoogleMapsUsageStore = {
      getGeocodingCache: async () => null,
      putGeocodingCache: async () => undefined,
      recordCacheEvent: async () => undefined,
      reserve: async () => ({ allowed: true, reason: null }),
      recordResult: async () => undefined,
    };
    await expect(createProtectedStaticMapImageLoader({ fetcher, store: baseStore })(request)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(fetcher).toHaveBeenCalledOnce();

    const blockedStore = { ...baseStore, reserve: async () => ({ allowed: false, reason: "daily_limit" as const, dailyCount: 100 }) };
    await expect(createProtectedStaticMapImageLoader({ fetcher, store: blockedStore })(request)).rejects.toMatchObject({ reason: "daily_limit" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("ouvre le circuit sur les réponses de quota Static Maps sans retry", async () => {
    const request = createGoogleStaticMapRequest(createReportMapEntries(preparedWithCoordinates(1)), { apiKey: "test-key" })!;
    const fetcher = vi.fn().mockResolvedValue(new Response("RESOURCE_EXHAUSTED", {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    }));
    const recordResult = vi.fn(async () => undefined);
    const store: GoogleMapsUsageStore = {
      getGeocodingCache: async () => null,
      putGeocodingCache: async () => undefined,
      recordCacheEvent: async () => undefined,
      reserve: async () => ({ allowed: true, reason: null }),
      recordResult,
    };
    await expect(createProtectedStaticMapImageLoader({ fetcher, store })(request)).rejects.toThrow(/quota/i);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(recordResult).toHaveBeenCalledWith("static_map", true);
  });
});
