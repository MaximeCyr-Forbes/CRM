import { describe, expect, it, vi } from "vitest";
import { createValidatedGoogleLocation } from "./geocoding";
import { createGeocodingRequestCache } from "./geocoding-cache";

const input = { address: "249 14e Avenue", city: "Deux-Montagnes", postalCode: "J7R 3W3" };

function locationFor(address: string) {
  return createValidatedGoogleLocation(
    { ...input, address },
    {
      coordinates: { latitude: 45.54, longitude: -73.9 },
      formattedAddress: `${address}, Deux-Montagnes, QC, Canada`,
      placeId: `place-${address}`,
    },
    `${address}, Deux-Montagnes, QC, Canada`,
  );
}

describe("cache des requêtes Google Geocoding", () => {
  it("fait un seul appel pour une adresse puis retourne un cache hit", async () => {
    const requester = vi.fn(async (request) => locationFor(request.address));
    const log = vi.fn();
    const cache = createGeocodingRequestCache(requester, log);
    expect(await cache.get(input)).toEqual(await cache.get(input));
    expect(requester).toHaveBeenCalledOnce();
    expect(log).toHaveBeenNthCalledWith(1, "GOOGLE GEO CACHE MISS");
    expect(log).toHaveBeenNthCalledWith(2, "GOOGLE GEO CACHE HIT");
  });

  it("invalide naturellement le cache lorsque l’adresse change", async () => {
    const requester = vi.fn(async (request) => locationFor(request.address));
    const cache = createGeocodingRequestCache(requester);
    await cache.get(input);
    const changed = await cache.get({ ...input, address: "251 14e Avenue" });
    expect(requester).toHaveBeenCalledTimes(2);
    expect(changed?.geo.addressFingerprint).not.toBe(locationFor(input.address).geo.addressFingerprint);
  });

  it("déduplique les demandes simultanées", async () => {
    const requester = vi.fn(async (request) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return locationFor(request.address);
    });
    const cache = createGeocodingRequestCache(requester);
    const [first, second] = await Promise.all([cache.get(input), cache.get(input)]);
    expect(first).toEqual(second);
    expect(requester).toHaveBeenCalledOnce();
  });
});
