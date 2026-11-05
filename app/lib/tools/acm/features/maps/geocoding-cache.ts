import {
  buildAddressFingerprint,
  type PropertyGeocodingRequest,
  type ValidatedPropertyLocation,
} from "./geocoding";

type GeocodingRequester = (input: PropertyGeocodingRequest) => Promise<ValidatedPropertyLocation | null>;

export function createGeocodingRequestCache(
  requestLocation: GeocodingRequester,
  log: (message: string) => void = () => undefined,
) {
  const resolved = new Map<string, ValidatedPropertyLocation | null>();
  const inFlight = new Map<string, Promise<ValidatedPropertyLocation | null>>();

  return {
    async get(input: PropertyGeocodingRequest): Promise<ValidatedPropertyLocation | null> {
      const fingerprint = buildAddressFingerprint(input);
      if (!fingerprint) return null;
      if (resolved.has(fingerprint)) {
        log("GOOGLE GEO CACHE HIT");
        return resolved.get(fingerprint) ?? null;
      }
      const activeRequest = inFlight.get(fingerprint);
      if (activeRequest) {
        log("GOOGLE GEO CACHE HIT");
        return activeRequest;
      }

      log("GOOGLE GEO CACHE MISS");
      const request = requestLocation(input).then((location) => {
        resolved.set(fingerprint, location);
        return location;
      });
      inFlight.set(fingerprint, request);
      try {
        return await request;
      } finally {
        inFlight.delete(fingerprint);
      }
    },
  };
}
