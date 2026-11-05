import "server-only";

import type { PropertyGeocodingRequest, ValidatedPropertyLocation } from "../geocoding";
import {
  buildAddressFingerprint,
  buildGeocodingAttempts,
  createValidatedGoogleLocation,
  selectValidatedGoogleResult,
} from "../geocoding";

export interface GoogleRequestProtection {
  beforeRequest(): Promise<void>;
  recordResult(quotaFailure: boolean): Promise<void>;
}

interface GoogleGeocoderOptions {
  apiKey?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  now?: () => Date;
  protection?: GoogleRequestProtection;
}

const inFlightRequests = new Map<string, Promise<ValidatedPropertyLocation | null>>();

function developmentLog(message: string) {
  if (process.env.NODE_ENV === "development") console.info(message);
}

export function createGoogleGeocoder({
  apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim(),
  baseUrl = "https://maps.googleapis.com/maps/api/geocode/json",
  fetcher = fetch,
  now = () => new Date(),
  protection,
}: GoogleGeocoderOptions = {}) {
  async function search(query: string): Promise<unknown> {
    if (!apiKey) throw new Error("Google Maps server key is not configured");
    const url = new URL(baseUrl);
    url.searchParams.set("address", query);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("language", "fr");
    url.searchParams.set("region", "ca");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await protection?.beforeRequest();
      developmentLog("GOOGLE GEOCODING REQUEST");
      let response: Response;
      try {
        response = await fetcher(url, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(7_000),
        });
      } catch (error) {
        if (attempt === 0) continue;
        throw error;
      }

      if (response.status === 429) {
        developmentLog("GOOGLE GEOCODING HTTP 429");
        await protection?.recordResult(true);
        throw new Error("Google Geocoding quota unavailable");
      }
      if (!response.ok) {
        developmentLog(`GOOGLE GEOCODING HTTP ${response.status}`);
        await protection?.recordResult(false);
        if (response.status >= 500 && attempt === 0) continue;
        throw new Error("Google Geocoding is temporarily unavailable");
      }

      const payload = await response.json() as { status?: unknown };
      const status = typeof payload.status === "string" ? payload.status : "UNKNOWN";
      if (status !== "OK") developmentLog(`GOOGLE GEOCODING STATUS ${status}`);
      if (status === "OVER_QUERY_LIMIT" || status === "RESOURCE_EXHAUSTED") {
        await protection?.recordResult(true);
        throw new Error("Google Geocoding quota unavailable");
      }
      await protection?.recordResult(false);
      if (status === "UNKNOWN_ERROR" && attempt === 0) continue;
      return payload;
    }
    throw new Error("Google Geocoding is temporarily unavailable");
  }

  return async function geocode(input: PropertyGeocodingRequest): Promise<ValidatedPropertyLocation | null> {
    const fingerprint = buildAddressFingerprint(input);
    if (!fingerprint) return null;
    const existing = inFlightRequests.get(fingerprint);
    if (existing) return existing;

    const request = (async () => {
      const query = buildGeocodingAttempts(input)[0];
      if (!query) return null;
      const candidate = selectValidatedGoogleResult(await search(query), input);
      return candidate
        ? createValidatedGoogleLocation(input, candidate, query, now().toISOString())
        : null;
    })();

    inFlightRequests.set(fingerprint, request);
    try {
      return await request;
    } finally {
      inFlightRequests.delete(fingerprint);
    }
  };
}
