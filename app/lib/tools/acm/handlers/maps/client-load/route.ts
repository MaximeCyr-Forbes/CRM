import { googleMapsUsageStore } from "@/app/lib/tools/acm/features/maps/server/supabase-usage-store";
import { createGoogleMapsUsageGuard, GoogleMapsLimitError } from "@/app/lib/tools/acm/features/maps/server/usage-protection";

export const runtime = "nodejs";

const guard = createGoogleMapsUsageGuard(googleMapsUsageStore);
type ReserveInteractiveMapLoad = () => Promise<void>;

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function createClientMapLoadPostHandler(reserve: ReserveInteractiveMapLoad) {
  return async function post(request: Request) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return errorResponse("Origine de requête non autorisée.", 403);
    try {
      await reserve();
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof GoogleMapsLimitError) {
        return errorResponse("La carte interactive est temporairement indisponible.", 429);
      }
      return errorResponse("La carte interactive est temporairement indisponible.", 503);
    }
  };
}

export const POST = createClientMapLoadPostHandler(() => guard.reserve("maps_javascript"));
