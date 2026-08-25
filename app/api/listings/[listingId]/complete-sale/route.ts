import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { isUuid } from "../../../../lib/listings/persistence";

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

  return Response.json(
    { error: "Finalisez la vente depuis la Transaction liée afin de protéger l’historique." },
    { status: 409 },
  );
}
