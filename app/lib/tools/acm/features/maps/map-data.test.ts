import { describe, expect, it } from "vitest";
import type { ParsedProperty, PropertyDocumentType, PropertySourceType } from "@/app/lib/tools/acm/types";
import { assignPropertyPosition, createComparisonSelection } from "@/app/lib/tools/acm/features/comparables";
import { createComparableMapEntries } from "./map-data";
import { createValidatedGoogleLocation } from "./geocoding";

function property(id: string, latitude?: number, longitude?: number, documentType?: PropertyDocumentType, sourceType?: PropertySourceType): ParsedProperty {
  const location = latitude !== undefined && longitude !== undefined
    ? createValidatedGoogleLocation(
      { address: id },
      { coordinates: { latitude, longitude }, formattedAddress: `${id}, Québec, Canada`, placeId: `place-${id}` },
      `${id}, QC, Canada`,
      "2026-09-01T13:00:00.000Z",
    )
    : {};
  return {
    id,
    sourceFile: `${id}.pdf`,
    sourceType,
    documentType,
    data: { address: id, ...location },
    fieldConfidence: {}, overallConfidence: "high", pageCount: 1, warnings: [],
  };
}

describe("données de la carte des comparables", () => {
  it("numérote un sujet et deux comparables dans l’ordre ACM", () => {
    const entries = createComparableMapEntries(property("subject", 45.5, -73.9), [property("one", 45.51, -73.91), property("two", 45.52, -73.92)]);
    expect(entries.map(({ role, markerLabel }) => ({ role, markerLabel }))).toEqual([
      { role: "Sujet", markerLabel: "S" },
      { role: "Comparable 1", markerLabel: "1" },
      { role: "Comparable 2", markerLabel: "2" },
    ]);
  });

  it("s’adapte à cinq comparables de sources JLR, Centris et manuelle", () => {
    const subject = property("jlr-subject", 45.5, -73.9, "jlr", "pdf");
    const comparables = [
      property("centris-1", 45.51, -73.91, "centris", "pdf"),
      property("manual-2", 45.52, -73.92, "unknown", "manual"),
      property("centris-3", 45.53, -73.93, "centris", "pdf"),
      property("centris-4", 45.54, -73.94, "centris", "pdf"),
      property("centris-5", 45.55, -73.95, "centris", "pdf"),
    ];
    expect(createComparableMapEntries(subject, comparables).map(({ role }) => role)).toEqual([
      "Sujet", "Comparable 1", "Comparable 2", "Comparable 3", "Comparable 4", "Comparable 5",
    ]);
  });

  it("reflète immédiatement un changement de sujet et une permutation", () => {
    const properties = [property("subject"), property("one"), property("two")];
    let selection = createComparisonSelection(properties.map(({ id }) => id));
    selection = assignPropertyPosition(selection, "two", 0);
    selection = assignPropertyPosition(selection, "subject", 1);
    const byId = new Map(properties.map((item) => [item.id, item]));
    const entries = createComparableMapEntries(byId.get(selection.subjectId)!, selection.comparableIds.map((id) => byId.get(id)!));
    expect(entries.map(({ property: item }) => item.id)).toEqual(["two", "subject", "one"]);
  });

  it("conserve exactement les coordonnées Google sauvegardées", () => {
    const entries = createComparableMapEntries(property("subject", 45.5, -73.9), [property("one", 45.6, -74.1), property("missing")]);
    expect(entries.map(({ coordinates }) => coordinates)).toEqual([
      { latitude: 45.5, longitude: -73.9 },
      { latitude: 45.6, longitude: -74.1 },
      null,
    ]);
  });

  it("reste stable lorsqu’aucune adresse ne peut être localisée", () => {
    expect(createComparableMapEntries(property("unknown"), [property("also-unknown")]).every(({ coordinates }) => coordinates === null)).toBe(true);
  });

  it("refuse une ancienne coordonnée non validée", () => {
    const legacy = property("legacy");
    legacy.data.coordinates = { latitude: 45.5, longitude: -73.9 };
    expect(createComparableMapEntries(legacy, [])[0].coordinates).toBeNull();
  });
});
