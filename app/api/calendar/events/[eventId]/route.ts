import { isCalendarBroker } from "../../../../data/calendar-types";
import { validateCalendarEventInput } from "../../../../lib/google-calendar/calendar-events";
import {
  deleteGoogleCalendarEvent,
  GoogleCalendarEventNotFoundError,
  GoogleCalendarNotConnectedError,
  ManagedGoogleCalendarEventError,
  updateGoogleCalendarEvent,
} from "../../../../lib/google-calendar/service";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { requireApiAccess } from "../../../../lib/crm-access";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ eventId: string }> };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function validEventId(eventId: string) {
  return eventId.length > 0 && eventId.length <= 1024;
}

function calendarError(error: unknown, action: "modifier" | "supprimer") {
  if (error instanceof GoogleCalendarEventNotFoundError) {
    return json({ error: "Cet événement n’existe plus dans Google Agenda." }, 404);
  }
  if (error instanceof ManagedGoogleCalendarEventError) {
    return json({ error: "Cet événement est géré automatiquement par le CRM." }, 409);
  }
  if (error instanceof GoogleCalendarNotConnectedError) {
    return json({ error: "Google Agenda non connecté." }, 409);
  }
  console.error(`Impossible de ${action} l’événement Google:`, error instanceof Error ? error.message : "erreur inconnue");
  return json({ error: `Impossible de ${action} cet événement dans Google Agenda.` }, 502);
}

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return json({ error: "Origine refusée." }, 403);
  const { eventId } = await context.params;
  const input = validateCalendarEventInput(await request.json().catch(() => null));
  if (!validEventId(eventId) || !input) return json({ error: "Événement invalide." }, 400);
  try {
    return json({ data: await updateGoogleCalendarEvent(eventId, input) });
  } catch (error) {
    return calendarError(error, "modifier");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return json({ error: "Origine refusée." }, 403);
  const { eventId } = await context.params;
  const broker = new URL(request.url).searchParams.get("broker");
  if (!validEventId(eventId) || !isCalendarBroker(broker)) return json({ error: "Événement invalide." }, 400);
  try {
    await deleteGoogleCalendarEvent(broker, eventId);
    return json({ data: { eventId } });
  } catch (error) {
    return calendarError(error, "supprimer");
  }
}
