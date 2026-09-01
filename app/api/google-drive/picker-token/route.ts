import { isCalendarBroker } from "../../../data/calendar-types";
import { requireApiAccess } from "../../../lib/crm-access";
import {
  getGoogleDrivePickerAccessToken,
  GoogleDriveAuthorizationRequiredError,
} from "../../../lib/google-drive/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const broker = new URL(request.url).searchParams.get("broker");
  if (!isCalendarBroker(broker)) {
    return Response.json({ error: "Courtier invalide." }, { status: 400 });
  }

  try {
    return Response.json(
      { accessToken: await getGoogleDrivePickerAccessToken(broker) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof GoogleDriveAuthorizationRequiredError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error(
      "Jeton Google Picker indisponible:",
      error instanceof Error ? error.message : "erreur inconnue",
    );
    return Response.json(
      { error: "Google Picker est temporairement indisponible." },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
