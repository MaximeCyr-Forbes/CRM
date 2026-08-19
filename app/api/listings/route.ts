import type { ListingFilters } from "../../lib/listings/server-service";
import { requireApiAccess } from "../../lib/crm-access";
import { isSameOriginRequest } from "../../lib/google-calendar/config";
import { listingApiError } from "../../lib/listings/api-response";
import {
  isListingBroker,
  isListingPurpose,
  isListingStatus,
  parseListingDraft,
} from "../../lib/listings/persistence";
import { createListing, listListings } from "../../lib/listings/server-service";

export const dynamic = "force-dynamic";

function listingFilters(url: URL): ListingFilters | null {
  const broker = url.searchParams.get("broker");
  const status = url.searchParams.get("status");
  const purpose = url.searchParams.get("purpose");
  if (broker !== null && !isListingBroker(broker)) return null;
  if (status !== null && !isListingStatus(status)) return null;
  if (purpose !== null && !isListingPurpose(purpose)) return null;
  return {
    ...(broker ? { broker } : {}),
    ...(status ? { status } : {}),
    ...(purpose ? { purpose } : {}),
  };
}

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const filters = listingFilters(new URL(request.url));
  if (!filters) return Response.json({ error: "Filtres Listings invalides." }, { status: 400 });

  try {
    return Response.json(
      { data: await listListings(filters) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return listingApiError(error, "Chargement des Listings impossible.");
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { draft?: unknown } | null;
  const draft = parseListingDraft(body?.draft);
  if (!draft) return Response.json({ error: "Listing invalide." }, { status: 400 });

  try {
    return Response.json({ data: await createListing(draft) }, { status: 201 });
  } catch (error) {
    return listingApiError(error, "Création du Listing impossible.");
  }
}
