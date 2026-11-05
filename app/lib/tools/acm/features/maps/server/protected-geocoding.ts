import "server-only";

import { createHash } from "node:crypto";
import {
  buildAddressFingerprint,
  buildGeocodingAddress,
  type PropertyGeocodingRequest,
  type ValidatedPropertyLocation,
} from "../geocoding";
import { createGoogleGeocoder } from "./google";
import { googleMapsUsageStore } from "./supabase-usage-store";
import { createGoogleMapsUsageGuard, type GoogleMapsUsageStore } from "./usage-protection";

interface ProtectedGeocoderOptions {
  apiKey?: string;
  fetcher?: typeof fetch;
  now?: () => Date;
  store?: GoogleMapsUsageStore;
}

const inFlightRequests = new Map<string, Promise<ValidatedPropertyLocation | null>>();

function developmentLog(message: string) {
  if (process.env.NODE_ENV === "development") console.info(message);
}

export function geocodingCacheKey(fingerprint: string): string {
  return createHash("sha256").update(fingerprint).digest("hex");
}

export function createProtectedGoogleGeocoder({
  apiKey,
  fetcher,
  now,
  store = googleMapsUsageStore,
}: ProtectedGeocoderOptions = {}) {
  const guard = createGoogleMapsUsageGuard(store);
  const googleGeocode = createGoogleGeocoder({
    apiKey,
    fetcher,
    now,
    protection: {
      beforeRequest: () => guard.reserve("geocoding"),
      recordResult: (quotaFailure) => guard.recordResult("geocoding", quotaFailure),
    },
  });

  return async function geocode(input: PropertyGeocodingRequest): Promise<ValidatedPropertyLocation | null> {
    const fingerprint = buildAddressFingerprint(input);
    const sourceAddress = buildGeocodingAddress(input);
    if (!fingerprint || !sourceAddress) return null;
    const cacheKey = geocodingCacheKey(fingerprint);
    const existing = inFlightRequests.get(cacheKey);
    if (existing) {
      developmentLog("GOOGLE GEO CACHE HIT");
      return existing;
    }

    const request = (async () => {
      const cached = await store.getGeocodingCache(cacheKey);
      if (cached?.geo.addressFingerprint === fingerprint) {
        developmentLog("GOOGLE GEO CACHE HIT");
        await store.recordCacheEvent("hit").catch(() => undefined);
        return cached;
      }

      developmentLog("GOOGLE GEO CACHE MISS");
      await store.recordCacheEvent("miss").catch(() => undefined);
      const location = await googleGeocode(input);
      if (location) await store.putGeocodingCache(cacheKey, sourceAddress, location);
      return location;
    })();

    inFlightRequests.set(cacheKey, request);
    try {
      return await request;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  };
}

export const geocodeWithGoogle = createProtectedGoogleGeocoder();
