import "server-only";

import type { ValidatedPropertyLocation } from "../geocoding";

export type GoogleMapsProtectedService = "geocoding" | "static_map" | "maps_javascript";
export type GoogleMapsLimitReason = "daily_limit" | "minute_limit" | "circuit_open";

export interface GoogleMapsReservation {
  allowed: boolean;
  reason: GoogleMapsLimitReason | null;
  dailyCount?: number;
  minuteCount?: number;
}

export interface GoogleMapsUsageSummary {
  usageDay: string;
  googleGeocodingRequests: number;
  googleStaticMapRequests: number;
  googleMapsJavascriptLoads: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface GoogleMapsUsageStore {
  getGeocodingCache(cacheKey: string): Promise<ValidatedPropertyLocation | null>;
  putGeocodingCache(cacheKey: string, sourceAddress: string, location: ValidatedPropertyLocation): Promise<void>;
  recordCacheEvent(event: "hit" | "miss"): Promise<void>;
  recordResult(service: GoogleMapsProtectedService, quotaFailure: boolean): Promise<void>;
  reserve(service: GoogleMapsProtectedService, dailyLimit: number, minuteLimit: number): Promise<GoogleMapsReservation>;
  summary?(): Promise<GoogleMapsUsageSummary | null>;
}

export interface GoogleMapsUsageLimits {
  daily: number;
  minute: number;
}

export const GOOGLE_MAPS_USAGE_LIMITS: Record<GoogleMapsProtectedService, GoogleMapsUsageLimits> = {
  geocoding: { daily: 100, minute: 20 },
  static_map: { daily: 100, minute: 20 },
  maps_javascript: { daily: 500, minute: 60 },
};

export class GoogleMapsProtectionUnavailableError extends Error {
  constructor() {
    super("Google Maps usage protection is unavailable");
    this.name = "GoogleMapsProtectionUnavailableError";
  }
}

export class GoogleMapsLimitError extends Error {
  constructor(
    readonly service: GoogleMapsProtectedService,
    readonly reason: GoogleMapsLimitReason,
  ) {
    super(`Google Maps ${service} blocked by ${reason}`);
    this.name = "GoogleMapsLimitError";
  }
}

function developmentLog(message: string) {
  if (process.env.NODE_ENV === "development") console.info(message);
}

export function createGoogleMapsUsageGuard(
  store: GoogleMapsUsageStore,
  limits: Record<GoogleMapsProtectedService, GoogleMapsUsageLimits> = GOOGLE_MAPS_USAGE_LIMITS,
) {
  return {
    async reserve(service: GoogleMapsProtectedService): Promise<void> {
      let reservation: GoogleMapsReservation;
      try {
        reservation = await store.reserve(service, limits[service].daily, limits[service].minute);
      } catch {
        throw new GoogleMapsProtectionUnavailableError();
      }
      if (reservation.allowed) return;
      if (reservation.reason === "daily_limit") developmentLog("GOOGLE DAILY LIMIT HIT");
      else developmentLog("GOOGLE RATE LIMIT HIT");
      throw new GoogleMapsLimitError(service, reservation.reason ?? "circuit_open");
    },

    async recordResult(service: GoogleMapsProtectedService, quotaFailure: boolean): Promise<void> {
      try {
        await store.recordResult(service, quotaFailure);
      } catch {
        // The reservation already counted this request. A telemetry failure must not retry Google.
      }
    },
  };
}
