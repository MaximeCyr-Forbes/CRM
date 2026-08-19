import { requireApiAccess } from "../../../../lib/crm-access";
import { listingApiError } from "../../../../lib/listings/api-response";
import { isUuid } from "../../../../lib/listings/persistence";
import { getListingReportData } from "../../../../lib/listings/report";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ listingId: string }> };

export async function GET(_request: Request, context: Context) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const { listingId } = await context.params;
  if (!isUuid(listingId)) return Response.json({ error: "Listing invalide." }, { status: 400 });
  try {
    return Response.json({ data: await getListingReportData(listingId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return listingApiError(error, "Chargement du rapport impossible.");
  }
}
