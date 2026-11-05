import { createComparableMapEntries, type ComparableMapEntry } from "@/app/lib/tools/acm/features/maps/map-data";
import { googleMapsUsageStore } from "@/app/lib/tools/acm/features/maps/server/supabase-usage-store";
import { createGoogleMapsUsageGuard, type GoogleMapsUsageStore } from "@/app/lib/tools/acm/features/maps/server/usage-protection";
import type { ReportDocumentData } from "../types";

export const STATIC_MAP_PIXEL_WIDTH = 1_280;
export const STATIC_MAP_PIXEL_HEIGHT = 850;

export interface GoogleStaticMapRequest {
  pixelHeight: number;
  pixelWidth: number;
  url: string;
}

export type StaticMapImageLoader = (request: GoogleStaticMapRequest) => Promise<Uint8Array>;

interface StaticMapLoaderOptions {
  fetcher?: typeof fetch;
  store?: GoogleMapsUsageStore;
}

interface StaticMapRequestOptions {
  apiKey?: string;
  baseUrl?: string;
}

function developmentLog(message: string) {
  if (process.env.NODE_ENV === "development") console.info(message);
}

function staticMarkerLabel(markerLabel: string): string {
  if (/^[A-Z0-9]$/i.test(markerLabel)) return markerLabel.toUpperCase();
  const numeric = Number(markerLabel);
  if (Number.isInteger(numeric) && numeric >= 10 && numeric <= 35) return String.fromCharCode(55 + numeric);
  return "X";
}

export function createReportMapEntries(data: ReportDocumentData): ComparableMapEntry[] {
  return createComparableMapEntries(
    data.subject.property,
    data.comparables.filter(({ analysis }) => analysis.included).map(({ property }) => property),
  );
}

export function createGoogleStaticMapRequest(
  entries: ComparableMapEntry[],
  {
    apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim(),
    baseUrl = "https://maps.googleapis.com/maps/api/staticmap",
  }: StaticMapRequestOptions = {},
): GoogleStaticMapRequest | null {
  const locatedEntries = entries.filter((entry) => entry.coordinates !== null);
  if (!apiKey || locatedEntries.length === 0) return null;

  const url = new URL(baseUrl);
  url.searchParams.set("size", "640x425");
  url.searchParams.set("scale", "2");
  url.searchParams.set("format", "png32");
  url.searchParams.set("maptype", "roadmap");
  url.searchParams.set("language", "fr");
  url.searchParams.set("region", "ca");
  url.searchParams.append("style", "feature:poi|element:labels|visibility:off");
  url.searchParams.append("style", "feature:transit|visibility:off");
  for (const entry of locatedEntries) {
    const coordinates = entry.coordinates!;
    const color = entry.isSubject ? "0x171717" : "0xffffff";
    url.searchParams.append(
      "markers",
      `size:mid|color:${color}|label:${staticMarkerLabel(entry.markerLabel)}|${coordinates.latitude},${coordinates.longitude}`,
    );
  }
  url.searchParams.set("key", apiKey);
  return { url: url.toString(), pixelWidth: STATIC_MAP_PIXEL_WIDTH, pixelHeight: STATIC_MAP_PIXEL_HEIGHT };
}

export function createProtectedStaticMapImageLoader({
  fetcher = fetch,
  store = googleMapsUsageStore,
}: StaticMapLoaderOptions = {}): StaticMapImageLoader {
  const guard = createGoogleMapsUsageGuard(store);
  return async function loadGoogleStaticMap(request) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await guard.reserve("static_map");
      developmentLog("GOOGLE STATIC MAP REQUEST");
      let response: Response;
      try {
        response = await fetcher(request.url, {
          cache: "no-store",
          headers: { Accept: "image/png" },
          signal: AbortSignal.timeout(8_000),
        });
      } catch (error) {
        if (attempt === 0) continue;
        throw error;
      }

      if (response.status === 429) {
        await guard.recordResult("static_map", true);
        throw new Error("Google Static Map quota unavailable");
      }
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!response.ok || !contentType.includes("image/png")) {
        const failureBody = await response.text().catch(() => "");
        const quotaFailure = /OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED/i.test(failureBody);
        await guard.recordResult("static_map", quotaFailure);
        if (quotaFailure) throw new Error("Google Static Map quota unavailable");
        if (response.status >= 500 && attempt === 0) continue;
        throw new Error("Google Static Map unavailable");
      }
      await guard.recordResult("static_map", false);
      return new Uint8Array(await response.arrayBuffer());
    }
    throw new Error("Google Static Map unavailable");
  };
}

export const fetchGoogleStaticMapImage = createProtectedStaticMapImageLoader();
