import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { listingApiError } from "../../../../lib/listings/api-response";
import {
  isListingBroker,
  isUuid,
  parseListingSaleCompletion,
} from "../../../../lib/listings/persistence";
import { completeListingSale } from "../../../../lib/listings/server-service";

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

  const body = (await request.json().catch(() => null)) as {
    values?: unknown;
    actorBroker?: unknown;
  } | null;
  const values = parseListingSaleCompletion(body?.values);
  if (!values) {
    return Response.json({ error: "Finalisation de la vente invalide." }, { status: 400 });
  }
  const actor = body?.actorBroker === null || body?.actorBroker === undefined
    ? null
    : isListingBroker(body.actorBroker) ? body.actorBroker : undefined;
  if (actor === undefined) {
    return Response.json({ error: "Courtier acteur invalide." }, { status: 400 });
  }

  try {
    return Response.json({ data: await completeListingSale(listingId, values, actor) });
  } catch (error) {
    return listingApiError(error, "Impossible d’enregistrer la vente.");
  }
}
