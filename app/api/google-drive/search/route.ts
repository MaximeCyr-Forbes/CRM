import { isCalendarBroker } from "../../../data/calendar-types";
import { requireApiAccess } from "../../../lib/crm-access";
import {
  GoogleDriveAuthorizationRequiredError,
  searchAuthorizedGoogleDrive,
} from "../../../lib/google-drive/service";

export const dynamic = "force-dynamic";

function json(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const search = new URL(request.url).searchParams;
  const broker = search.get("broker");
  const query = search.get("q")?.trim() ?? "";
  if (!isCalendarBroker(broker)) return json("Courtier invalide.", 400);
  if (!query || query.length > 120) return json("Recherche Google Drive invalide.", 400);

  try {
    return Response.json(
      { data: await searchAuthorizedGoogleDrive(broker, query) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof GoogleDriveAuthorizationRequiredError) return json(error.message, 409);
    console.error("Recherche Google Drive impossible:", error instanceof Error ? error.message : "erreur inconnue");
    return json("La recherche Google Drive est temporairement indisponible.", 502);
  }
}
