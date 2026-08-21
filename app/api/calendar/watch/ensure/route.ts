import { isCalendarBroker } from "../../../../data/calendar-types";
import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { ensureGoogleCalendarWatch } from "../../../../lib/google-calendar/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { broker?: unknown } | null;
  if (!isCalendarBroker(body?.broker)) {
    return Response.json({ error: "Courtier invalide." }, { status: 400 });
  }
  try {
    return Response.json(await ensureGoogleCalendarWatch(body.broker), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error(
      "Activation des notifications Google Calendar impossible:",
      error instanceof Error ? error.message : "Erreur inconnue",
    );
    return Response.json(
      { error: "Synchronisation instantanée temporairement indisponible." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
