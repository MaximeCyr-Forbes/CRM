import { isCalendarBroker } from "../../../data/calendar-types";
import {
  getApplicationOrigin,
  getGoogleOAuthConfig,
  getGoogleRedirectUri,
} from "../../../lib/google-calendar/config";
import { createOAuthState } from "../../../lib/google-calendar/oauth-state";
import { listGoogleConnectionStatuses } from "../../../lib/google-calendar/service";
import { requireApiAccess } from "../../../lib/crm-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) {
    return access.response;
  }
  const broker = new URL(request.url).searchParams.get("broker");
  if (!isCalendarBroker(broker)) {
    return Response.json({ error: "Courtier invalide." }, { status: 400 });
  }

  try {
    const connections = await listGoogleConnectionStatuses();
    if (connections.some((connection) => connection.broker === broker && connection.connected)) {
      const settingsUrl = new URL("/settings", getApplicationOrigin(request));
      settingsUrl.searchParams.set("google", "already-connected");
      settingsUrl.searchParams.set("broker", broker);
      return Response.redirect(settingsUrl.toString(), 302);
    }

    const { clientId } = getGoogleOAuthConfig();
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      access_type: "offline",
      client_id: clientId,
      include_granted_scopes: "true",
      prompt: "consent",
      redirect_uri: getGoogleRedirectUri(request),
      response_type: "code",
      scope: [
        "openid",
        "email",
        "https://www.googleapis.com/auth/calendar.events",
      ].join(" "),
      state: await createOAuthState(broker),
    }).toString();

    return Response.redirect(authorizationUrl.toString(), 302);
  } catch (caughtError) {
    console.error(
      "Impossible de préparer la connexion Google OAuth:",
      caughtError instanceof Error ? caughtError.message : "erreur inconnue",
    );
    return Response.json(
      { error: "Google OAuth n’est pas configuré sur le serveur." },
      { status: 503 },
    );
  }
}
