import { geocodeWithGoogle } from "@/app/lib/tools/acm/features/maps/server/protected-geocoding";
import { GoogleMapsLimitError } from "@/app/lib/tools/acm/features/maps/server/usage-protection";
import type { PropertyGeocodingRequest, ValidatedPropertyLocation } from "@/app/lib/tools/acm/features/maps/geocoding";

const MAX_FIELD_LENGTH = 160;

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

type Geocoder = (input: PropertyGeocodingRequest) => Promise<ValidatedPropertyLocation | null>;

export function createGeocodePostHandler(geocode: Geocoder) {
  return async function post(request: Request) {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 2_048) return errorResponse("La requête de géocodage est trop volumineuse.", 413);

    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return errorResponse("Origine de requête non autorisée.", 403);

    const body = await request.json().catch(() => null) as Partial<Record<keyof PropertyGeocodingRequest, unknown>> | null;
    const clean = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
    const input: PropertyGeocodingRequest = {
      address: clean(body?.address),
      city: clean(body?.city) || undefined,
      postalCode: clean(body?.postalCode) || undefined,
    };
    if (input.address.length < 3 || Object.values(input).some((value) => value && value.length > MAX_FIELD_LENGTH)) {
      return errorResponse("L’adresse à géocoder est invalide.", 400);
    }

    try {
      const location = await geocode(input);
      return Response.json(location ?? { geo: null }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof GoogleMapsLimitError && error.reason === "daily_limit") {
        return errorResponse("Limite quotidienne de localisation atteinte. Réessayez demain.", 429);
      }
      if (error instanceof GoogleMapsLimitError) {
        return errorResponse("La localisation est temporairement limitée. Réessayez dans quelques instants.", 429);
      }
      return errorResponse("La localisation est temporairement indisponible.", 503);
    }
  };
}

export const POST = createGeocodePostHandler(geocodeWithGoogle);
