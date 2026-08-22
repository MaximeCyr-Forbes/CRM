import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import {
  isTransactionUuid,
  parseTransactionSaleCompletion,
  TransactionSaleCompletionError,
} from "../../../../lib/transactions/sale-completion";
import { completeTransactionSale } from "../../../../lib/transactions/server-service";

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

  const body = (await request.json().catch(() => null)) as { values?: unknown } | null;
  const values = parseTransactionSaleCompletion(body?.values);
  if (!values) {
    return Response.json({ error: "Finalisation de la vente invalide." }, { status: 400 });
  }

  try {
    return Response.json({ data: await completeTransactionSale(transactionId, values) });
  } catch (error) {
    console.error("Finalisation de vente Transaction impossible", error);
    if (error instanceof TransactionSaleCompletionError) {
      const status = error.code === "not_found"
        ? 404
        : error.code === "already_finalized" ? 409 : 400;
      return Response.json({ error: error.message }, { status });
    }
    return Response.json({ error: "Impossible de finaliser la vente." }, { status: 502 });
  }
}
