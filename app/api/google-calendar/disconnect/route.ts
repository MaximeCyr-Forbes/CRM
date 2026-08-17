import { isCalendarBroker } from "../../../data/calendar-types";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { disconnectGoogleCalendar } from "../../../lib/google-calendar/service";
import { requireApiAccess } from "../../../lib/crm-access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) {
    return access.response;
  }
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { broker?: unknown } | null;
  if (!isCalendarBroker(body?.broker)) {
    return Response.json({ error: "Courtier invalide." }, { status: 400 });
  }

  try {
    await disconnectGoogleCalendar(body.broker);
    return Response.json({ disconnected: true });
  } catch {
    return Response.json(
      {
        error:
          "Impossible de déconnecter Google Agenda sans laisser de relance orpheline.",
      },
      { status: 502 },
    );
  }
}
