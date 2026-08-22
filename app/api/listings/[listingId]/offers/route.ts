import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { listingApiError } from "../../../../lib/listings/api-response";
import { createListingOffer, getListingTransactionLink, listConsumedListingOfferIds, listListingOffers } from "../../../../lib/listings/offers";
import { isListingBroker, isUuid } from "../../../../lib/listings/persistence";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ listingId: string }> };

async function listingIdFrom(context: Context) {
  const { listingId } = await context.params;
  return isUuid(listingId) ? listingId : null;
}

export async function GET(_request: Request, context: Context) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const listingId = await listingIdFrom(context);
  if (!listingId) return Response.json({ error: "Listing invalide." }, { status: 400 });
  try {
    const [offers, transactionLink, consumedOfferIds] = await Promise.all([
      listListingOffers(listingId), getListingTransactionLink(listingId), listConsumedListingOfferIds(listingId),
    ]);
    return Response.json({ data: { offers, transactionLink, consumedOfferIds } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return listingApiError(error, "Chargement des offres impossible.");
  }
}

export async function POST(request: Request, context: Context) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const listingId = await listingIdFrom(context);
  if (!listingId) return Response.json({ error: "Listing invalide." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const actor = body?.actorBroker === null || body?.actorBroker === undefined
    ? null : isListingBroker(body.actorBroker) ? body.actorBroker : undefined;
  if (!body || actor === undefined) return Response.json({ error: "Offre invalide." }, { status: 400 });
  try {
    return Response.json({ data: await createListingOffer(listingId, body.offer, actor) }, { status: 201 });
  } catch (error) {
    return listingApiError(error, "Création de l’offre impossible.");
  }
}
