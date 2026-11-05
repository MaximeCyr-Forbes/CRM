import { describe, expect, it } from "vitest";
import {
  buildAddressFingerprint,
  buildGeocodingAddress,
  buildGeocodingAttempts,
  createValidatedGoogleLocation,
  isReusableGoogleGeo,
  isValidCoordinates,
  selectValidatedGoogleResult,
} from "./geocoding";

const input = { address: "249 14e Avenue", city: "Deux-Montagnes", postalCode: "J7R 3W3" };

function component(longName: string, shortName: string, ...types: string[]) {
  return { long_name: longName, short_name: shortName, types };
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    address_components: [
      component("249", "249", "street_number"),
      component("14e Avenue", "14e Av", "route"),
      component("Deux-Montagnes", "Deux-Montagnes", "locality", "political"),
      component("Québec", "QC", "administrative_area_level_1", "political"),
      component("Canada", "CA", "country", "political"),
      component("J7R 3W3", "J7R 3W3", "postal_code"),
    ],
    formatted_address: "249 14e Avenue, Deux-Montagnes, QC J7R 3W3, Canada",
    geometry: { location: { lat: 45.534, lng: -73.901 }, location_type: "ROOFTOP" },
    place_id: "google-place-249",
    types: ["street_address"],
    ...overrides,
  };
}

function response(overrides: Record<string, unknown> = {}) {
  return { status: "OK", results: [result(overrides)] };
}

describe("géocodage Google validé des propriétés", () => {
  it("compose l’adresse complète et les trois replis stricts", () => {
    expect(buildGeocodingAddress(input)).toBe("249 14e Avenue, Deux-Montagnes, QC J7R 3W3, Canada");
    expect(buildGeocodingAttempts(input)).toEqual([
      "249 14e Avenue, Deux-Montagnes, QC J7R 3W3, Canada",
      "249 14e Avenue, Deux-Montagnes, QC, Canada",
      "14e Avenue, Deux-Montagnes, QC J7R 3W3, Canada",
    ]);
    expect(buildGeocodingAddress({ city: "Deux-Montagnes" })).toBeNull();
  });

  it("valide les composants Google exacts et conserve le Place ID", () => {
    const selected = selectValidatedGoogleResult(response(), input);
    expect(selected).toMatchObject({
      coordinates: { latitude: 45.534, longitude: -73.901 },
      formattedAddress: expect.stringContaining("Deux-Montagnes"),
      placeId: "google-place-249",
      score: 200,
    });
  });

  it("rejette les résultats partiels, vagues, aquatiques ou incohérents", () => {
    expect(selectValidatedGoogleResult(response({ partial_match: true }), input)).toBeNull();
    expect(selectValidatedGoogleResult(response({ types: ["natural_feature"] }), input)).toBeNull();
    expect(selectValidatedGoogleResult(response({ types: ["locality"] }), input)).toBeNull();
    expect(selectValidatedGoogleResult(response({ geometry: { location: { lat: 45.534, lng: -73.901 }, location_type: "APPROXIMATE" } }), input)).toBeNull();
    expect(selectValidatedGoogleResult(response({ geometry: { location: { lat: 43.6, lng: -79.3 }, location_type: "ROOFTOP" } }), input)).toBeNull();
  });

  it("rejette un mauvais numéro, une mauvaise rue, ville, province, poste ou pays", () => {
    const components = result().address_components;
    const replace = (type: string, value: ReturnType<typeof component>) => components.map((item) => item.types.includes(type) ? value : item);
    expect(selectValidatedGoogleResult(response({ address_components: replace("street_number", component("251", "251", "street_number")) }), input)).toBeNull();
    expect(selectValidatedGoogleResult(response({ address_components: replace("route", component("Rue Blouin", "Rue Blouin", "route")) }), input)).toBeNull();
    expect(selectValidatedGoogleResult(response({ address_components: replace("locality", component("Laval", "Laval", "locality")) }), input)).toBeNull();
    expect(selectValidatedGoogleResult(response({ address_components: replace("administrative_area_level_1", component("Ontario", "ON", "administrative_area_level_1")) }), input)).toBeNull();
    expect(selectValidatedGoogleResult(response({ address_components: replace("postal_code", component("J7R 9Z9", "J7R 9Z9", "postal_code")) }), input)).toBeNull();
    expect(selectValidatedGoogleResult(response({ address_components: replace("country", component("United States", "US", "country")) }), input)).toBeNull();
  });

  it("réutilise seulement un geo Google valide lié à l’adresse courante", () => {
    const selected = selectValidatedGoogleResult(response(), input)!;
    const location = createValidatedGoogleLocation(input, selected, buildGeocodingAttempts(input)[0], "2026-09-01T13:00:00.000Z");
    expect(isReusableGoogleGeo({ ...input, ...location })).toBe(true);
    expect(isReusableGoogleGeo({ ...input, address: "251 14e Avenue", ...location })).toBe(false);
    expect(isReusableGoogleGeo({ ...input, coordinates: { latitude: 45.534, longitude: -73.901 } })).toBe(false);
    expect(isReusableGoogleGeo({
      ...input,
      ...location,
      geo: { ...location.geo, provider: "nominatim" as never },
    })).toBe(false);
    expect(location.geo.addressFingerprint).toBe(buildAddressFingerprint(input));
    expect(isValidCoordinates({ latitude: Number.NaN, longitude: -73 })).toBe(false);
  });
});
