import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/app/lib/supabase/server";
import type { PropertyGeoData } from "@/app/lib/tools/acm/types";
import { isValidCoordinates, type ValidatedPropertyLocation } from "../geocoding";
import {
  GoogleMapsProtectionUnavailableError,
  type GoogleMapsProtectedService,
  type GoogleMapsReservation,
  type GoogleMapsUsageStore,
  type GoogleMapsUsageSummary,
} from "./usage-protection";

interface RpcResult<T> {
  data: T | null;
  error: unknown;
}

function validCachedLocation(value: unknown): value is ValidatedPropertyLocation {
  if (!value || typeof value !== "object") return false;
  const geo = (value as { geo?: unknown }).geo as Partial<PropertyGeoData> | undefined;
  if (!geo || geo.provider !== "google" || !isValidCoordinates(geo)) return false;
  const googleGeo = geo as Partial<PropertyGeoData>;
  return typeof googleGeo.placeId === "string" && googleGeo.placeId.length > 0
    && typeof googleGeo.formattedAddress === "string" && googleGeo.formattedAddress.length > 0
    && typeof googleGeo.geocodedAddress === "string" && googleGeo.geocodedAddress.length > 0
    && typeof googleGeo.geocodedAt === "string" && !Number.isNaN(Date.parse(googleGeo.geocodedAt))
    && typeof googleGeo.addressFingerprint === "string" && googleGeo.addressFingerprint.length > 0;
}

async function rpc<T>(name: string, parameters: Record<string, unknown>): Promise<T | null> {
  const result = await getSupabaseServiceClient().rpc(`acm_${name}`, parameters) as RpcResult<T>;
  if (result.error) throw new GoogleMapsProtectionUnavailableError();
  return result.data;
}

export function createSupabaseGoogleMapsUsageStore(): GoogleMapsUsageStore {
  return {
    async getGeocodingCache(cacheKey) {
      const value = await rpc<unknown>("get_google_geocoding_cache", { p_cache_key: cacheKey });
      return validCachedLocation(value) ? value : null;
    },

    async putGeocodingCache(cacheKey, sourceAddress, location) {
      await rpc("put_google_geocoding_cache", {
        p_cache_key: cacheKey,
        p_source_address: sourceAddress,
        p_geo_data: location,
      });
    },

    async recordCacheEvent(event) {
      await rpc("record_google_maps_cache_event", { p_event: event });
    },

    async reserve(service, dailyLimit, minuteLimit) {
      const value = await rpc<GoogleMapsReservation>("reserve_google_maps_request", {
        p_service: service,
        p_daily_limit: dailyLimit,
        p_minute_limit: minuteLimit,
      });
      if (!value || typeof value.allowed !== "boolean") throw new GoogleMapsProtectionUnavailableError();
      return value;
    },

    async recordResult(service: GoogleMapsProtectedService, quotaFailure) {
      await rpc("record_google_maps_result", { p_service: service, p_quota_failure: quotaFailure });
    },

    async summary() {
      return rpc<GoogleMapsUsageSummary>("get_google_maps_usage_summary", {});
    },
  };
}

export const googleMapsUsageStore = createSupabaseGoogleMapsUsageStore();
