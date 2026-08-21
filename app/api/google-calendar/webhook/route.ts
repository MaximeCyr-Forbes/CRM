import { processGoogleCalendarWebhook } from "../../../lib/google-calendar/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await processGoogleCalendarWebhook(request.headers);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(
      "Traitement webhook Google Calendar impossible:",
      error instanceof Error ? error.message : "Erreur inconnue",
    );
    return new Response(null, { status: 503 });
  }
}
