import { requireApiAccess } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { listingApiError } from "../../../lib/listings/api-response";
import { isUuid, parseListingUpdate } from "../../../lib/listings/persistence";
import {
  deleteListing,
  getListing,
  updateListing,
} from "../../../lib/listings/server-service";

export const dynamic = "force-dynamic";

type ListingRouteContext = { params: Promise<{ listingId: string }> };

async function listingIdFrom(context: ListingRouteContext) {
  const { listingId } = await context.params;
  return isUuid(listingId) ? listingId : null;
}

export async function GET(_request: Request, context: ListingRouteContext) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const listingId = await listingIdFrom(context);
  if (!listingId) return Response.json({ error: "Listing invalide." }, { status: 400 });

  try {
    return Response.json(
      { data: await getListing(listingId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return listingApiError(error, "Chargement du Listing impossible.");
  }
}

export async function PATCH(request: Request, context: ListingRouteContext) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const listingId = await listingIdFrom(context);
  if (!listingId) return Response.json({ error: "Listing invalide." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { values?: unknown } | null;
  const values = parseListingUpdate(body?.values);
  if (!values) return Response.json({ error: "Modification du Listing invalide." }, { status: 400 });

  try {
    return Response.json({ data: await updateListing(listingId, values) });
  } catch (error) {
    return listingApiError(error, "Modification du Listing impossible.");
  }
}

export async function DELETE(request: Request, context: ListingRouteContext) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const listingId = await listingIdFrom(context);
  if (!listingId) return Response.json({ error: "Listing invalide." }, { status: 400 });

  try {
    await deleteListing(listingId);
    return Response.json({ data: { listingId } });
  } catch (error) {
    return listingApiError(error, "Suppression du Listing impossible.");
  }
}
