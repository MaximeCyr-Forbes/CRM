import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { isListingBroker } from "../../../../lib/listings/persistence";
import {
  TransactionReturnToMarketError,
} from "../../../../lib/transactions/return-to-market";
import { isTransactionUuid } from "../../../../lib/transactions/sale-completion";
import { returnListingTransactionToMarket } from "../../../../lib/transactions/server-service";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ transactionId: string }> };

export async function POST(request: Request, context: Context) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }

  const { transactionId } = await context.params;
  if (!isTransactionUuid(transactionId)) {
    return Response.json({ error: "Transaction invalide." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { actorBroker?: unknown } | null;
  const actorBroker = body?.actorBroker === null || body?.actorBroker === undefined
    ? null
    : isListingBroker(body.actorBroker) ? body.actorBroker : undefined;
  if (actorBroker === undefined) {
    return Response.json({ error: "Courtier invalide." }, { status: 400 });
  }

  try {
    return Response.json({
      data: await returnListingTransactionToMarket(transactionId, actorBroker),
    });
  } catch (error) {
    console.error("Retour sur le marché impossible", error);
    if (error instanceof TransactionReturnToMarketError) {
      const status = error.code === "not_found"
        ? 404
        : error.code === "already_cancelled" ? 409 : 400;
      return Response.json({ error: error.message }, { status });
    }
    return Response.json({ error: "Impossible de remettre le Listing sur le marché." }, { status: 502 });
  }
}
