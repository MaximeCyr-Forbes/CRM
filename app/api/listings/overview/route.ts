import { requireApiAccess } from "../../../lib/crm-access";
import { listingApiError } from "../../../lib/listings/api-response";
import { getListingsOverview } from "../../../lib/listings/overview";
import { isListingBroker, isListingPurpose } from "../../../lib/listings/persistence";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const url = new URL(request.url);
  const brokerValue = url.searchParams.get("broker");
  const purposeValue = url.searchParams.get("purpose");
  if (brokerValue && !isListingBroker(brokerValue)) return Response.json({ error: "Courtier invalide." }, { status: 400 });
  if (purposeValue && !isListingPurpose(purposeValue)) return Response.json({ error: "Marché invalide." }, { status: 400 });
  try {
    return Response.json({ data: await getListingsOverview({
      ...(brokerValue && isListingBroker(brokerValue) ? { broker: brokerValue } : {}),
      ...(purposeValue && isListingPurpose(purposeValue) ? { purpose: purposeValue } : {}),
    }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return listingApiError(error, "Chargement de la vue d’ensemble impossible.");
  }
}
