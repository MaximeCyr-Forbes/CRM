import { isCalendarBroker } from "../../../data/calendar-types";
import { requireApiAccess } from "../../../lib/crm-access";
import { getGoogleCalendarWatchState } from "../../../lib/google-calendar/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const broker = new URL(request.url).searchParams.get("broker");
  if (!isCalendarBroker(broker)) {
    return Response.json({ error: "Courtier invalide." }, { status: 400 });
  }
  try {
    return Response.json(await getGoogleCalendarWatchState(broker), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "État de synchronisation Google indisponible." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
