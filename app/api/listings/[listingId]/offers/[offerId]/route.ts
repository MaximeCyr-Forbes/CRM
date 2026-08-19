import { requireApiAccess } from "../../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../../lib/google-calendar/config";
import { listingApiError } from "../../../../../lib/listings/api-response";
import {
  createTransactionFromListingOffer,
  deleteListingOffer,
  updateListingOffer,
} from "../../../../../lib/listings/offers";
import { isListingBroker, isUuid } from "../../../../../lib/listings/persistence";

type Context = { params: Promise<{ listingId: string; offerId: string }> };

async function writable(request: Request, context: Context) {
  const access = await requireApiAccess();
  if (access.response) return { response: access.response } as const;
  if (!isSameOriginRequest(request)) return { response: Response.json({ error: "Origine refusée." }, { status: 403 }) } as const;
  const { listingId, offerId } = await context.params;
  if (!isUuid(listingId) || !isUuid(offerId)) return { response: Response.json({ error: "Offre invalide." }, { status: 400 }) } as const;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const actor = body?.actorBroker === null || body?.actorBroker === undefined
    ? null : isListingBroker(body.actorBroker) ? body.actorBroker : undefined;
  if (!body || actor === undefined) return { response: Response.json({ error: "Offre invalide." }, { status: 400 }) } as const;
  return { response: null, listingId, offerId, body, actor } as const;
}

export async function PATCH(request: Request, context: Context) {
  const input = await writable(request, context);
  if (input.response) return input.response;
  try {
    return Response.json({ data: await updateListingOffer(input.listingId, input.offerId, input.body.offer, input.actor) });
  } catch (error) {
    return listingApiError(error, "Modification de l’offre impossible.");
  }
}

export async function DELETE(request: Request, context: Context) {
  const input = await writable(request, context);
  if (input.response) return input.response;
  try {
    await deleteListingOffer(input.listingId, input.offerId, input.actor);
    return Response.json({ data: { offerId: input.offerId } });
  } catch (error) {
    return listingApiError(error, "Suppression de l’offre impossible.");
  }
}

export async function POST(request: Request, context: Context) {
  const input = await writable(request, context);
  if (input.response) return input.response;
  if (input.body.action !== "createTransaction") {
    return Response.json({ error: "Action invalide." }, { status: 400 });
  }
  try {
    return Response.json({ data: await createTransactionFromListingOffer(input.listingId, input.offerId, input.actor) }, { status: 201 });
  } catch (error) {
    return listingApiError(error, "Création de la transaction impossible.");
  }
}
