import { isCalendarBroker } from "../../../data/calendar-types";
import { validateCalendarEventInput } from "../../../lib/google-calendar/calendar-events";
import {
  createGoogleCalendarEvent,
  GoogleCalendarNotConnectedError,
  listGoogleCalendarEventsWithMeta,
} from "../../../lib/google-calendar/service";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { requireApiAccess } from "../../../lib/crm-access";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const search = new URL(request.url).searchParams;
  const broker = search.get("broker");
  const start = search.get("start");
  const end = search.get("end");
  if (!isCalendarBroker(broker) || !start || !end) return json({ error: "Paramètres de calendrier invalides." }, 400);
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return json({ error: "Plage de calendrier invalide." }, 400);
  }
  try {
    const result = await listGoogleCalendarEventsWithMeta(broker, start, end);
    return json({
      data: result.events,
      meta: { centrisShowingsStatus: result.centrisShowingsStatus },
    });
  } catch (error) {
    if (error instanceof GoogleCalendarNotConnectedError) return json({ error: "Google Agenda non connecté." }, 409);
    console.error("Chargement du calendrier Google impossible:", error instanceof Error ? error.message : "erreur inconnue");
    return json({ error: "Impossible d’actualiser Google Agenda." }, 502);
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return json({ error: "Origine refusée." }, 403);
  const input = validateCalendarEventInput(await request.json().catch(() => null));
  if (!input) return json({ error: "Événement invalide." }, 400);
  try {
    return json({ data: await createGoogleCalendarEvent(input) }, 201);
  } catch (error) {
    if (error instanceof GoogleCalendarNotConnectedError) return json({ error: "Google Agenda non connecté." }, 409);
    console.error("Création d’un événement Google impossible:", error instanceof Error ? error.message : "erreur inconnue");
    return json({ error: "L’événement n’a pas pu être créé dans Google Agenda." }, 502);
  }
}
