import { describe, expect, it, vi } from "vitest";
import type { ValidatedPropertyLocation } from "../geocoding";
import { createProtectedGoogleGeocoder } from "./protected-geocoding";
import type { GoogleMapsProtectedService, GoogleMapsUsageStore } from "./usage-protection";

const input = { address: "249 14e Avenue", city: "Deux-Montagnes", postalCode: "J7R 3W3" };

function googleResponse() {
  return {
    status: "OK",
    results: [{
      address_components: [
        { long_name: "249", short_name: "249", types: ["street_number"] },
        { long_name: "14e Avenue", short_name: "14e Av", types: ["route"] },
        { long_name: "Deux-Montagnes", short_name: "Deux-Montagnes", types: ["locality", "political"] },
        { long_name: "Québec", short_name: "QC", types: ["administrative_area_level_1", "political"] },
        { long_name: "Canada", short_name: "CA", types: ["country", "political"] },
        { long_name: "J7R 3W3", short_name: "J7R 3W3", types: ["postal_code"] },
      ],
      formatted_address: "249 14e Avenue, Deux-Montagnes, QC J7R 3W3, Canada",
      geometry: { location: { lat: 45.534, lng: -73.901 }, location_type: "ROOFTOP" },
      place_id: "google-place-249",
      types: ["street_address"],
    }],
  };
}

function memoryStore() {
  const cache = new Map<string, ValidatedPropertyLocation>();
  const calls = { hits: 0, misses: 0, reservations: 0, results: [] as Array<[GoogleMapsProtectedService, boolean]> };
  const store: GoogleMapsUsageStore = {
    getGeocodingCache: async (key) => cache.get(key) ?? null,
    putGeocodingCache: async (key, _sourceAddress, location) => { cache.set(key, location); },
    recordCacheEvent: async (event) => { calls[event === "hit" ? "hits" : "misses"] += 1; },
    reserve: async () => { calls.reservations += 1; return { allowed: true, reason: null }; },
    recordResult: async (service, quotaFailure) => { calls.results.push([service, quotaFailure]); },
  };
  return { store, calls };
}

describe("géocodage Google protégé", () => {
  it("réutilise le cache partagé après le premier appel réel", async () => {
    const { store, calls } = memoryStore();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(googleResponse())));
    const geocode = createProtectedGoogleGeocoder({ store, apiKey: "server-test-key", fetcher });
    const first = await geocode(input);
    const second = await geocode(input);
    expect(first).toEqual(second);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(calls).toMatchObject({ hits: 1, misses: 1, reservations: 1 });
  });

  it("ne contacte pas Google lorsque la limite quotidienne est atteinte", async () => {
    const fetcher = vi.fn();
    const { store } = memoryStore();
    store.reserve = async () => ({ allowed: false, reason: "daily_limit", dailyCount: 100 });
    const geocode = createProtectedGoogleGeocoder({ store, apiKey: "server-test-key", fetcher });
    await expect(geocode(input)).rejects.toMatchObject({ reason: "daily_limit" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
