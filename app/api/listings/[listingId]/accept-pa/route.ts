import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { listingApiError } from "../../../../lib/listings/api-response";
import { parseListingAcceptedPaInput } from "../../../../lib/listings/accepted-pa";
import { acceptListingPurchaseAgreement } from "../../../../lib/listings/offers";
import { isListingBroker, isUuid } from "../../../../lib/listings/persistence";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ listingId: string }> };

export async function POST(request: Request, context: Context) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }

  const { listingId } = await context.params;
  if (!isUuid(listingId)) {
    return Response.json({ error: "Listing invalide." }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const actor = body?.actorBroker === null || body?.actorBroker === undefined
    ? null
    : isListingBroker(body.actorBroker) ? body.actorBroker : undefined;
  const values = parseListingAcceptedPaInput(body?.values);
  if (!body || actor === undefined || !values) {
    return Response.json({ error: "Promesse d’achat invalide." }, { status: 400 });
  }

  try {
    const data = await acceptListingPurchaseAgreement(listingId, values, actor);
    return Response.json({ data }, { status: 201 });
  } catch (error) {
    return listingApiError(error, "Création de la Transaction impossible.");
  }
}
