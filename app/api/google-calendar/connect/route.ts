import { isCalendarBroker } from "../../../data/calendar-types";
import {
  getApplicationOrigin,
  getGoogleOAuthConfig,
  getGoogleRedirectUri,
} from "../../../lib/google-calendar/config";
import { createOAuthState, sanitizeOAuthReturnTo, type GoogleOAuthCapability } from "../../../lib/google-calendar/oauth-state";
import { listGoogleConnectionStatuses } from "../../../lib/google-calendar/service";
import { requireApiAccess } from "../../../lib/crm-access";
import { GMAIL_SEND_SCOPE, GMAIL_SETTINGS_BASIC_SCOPE } from "../../../lib/google-gmail/scopes";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) {
    return access.response;
  }
  const requestUrl = new URL(request.url);
  const broker = requestUrl.searchParams.get("broker");
  const capabilityParam = requestUrl.searchParams.get("capability") ?? "calendar";
  if (capabilityParam !== "calendar" && capabilityParam !== "gmail") {
    return Response.json({ error: "Capacité Google invalide." }, { status: 400 });
  }
  const capability = capabilityParam as GoogleOAuthCapability;
  const returnTo = sanitizeOAuthReturnTo(requestUrl.searchParams.get("returnTo"));
  if (!isCalendarBroker(broker)) {
    return Response.json({ error: "Courtier invalide." }, { status: 400 });
  }

  try {
    const connections = await listGoogleConnectionStatuses();
    const connection = connections.find((item) => item.broker === broker);
    const capabilityAlreadyConnected = connection?.connected && (
      capability === "calendar" || (connection.gmailSendEnabled && connection.gmailSignatureEnabled)
    );
    if (capabilityAlreadyConnected) {
      const destinationUrl = new URL(returnTo, getApplicationOrigin(request));
      destinationUrl.searchParams.set(capability === "gmail" ? "gmail" : "google", "already-connected");
      destinationUrl.searchParams.set("broker", broker);
      return Response.redirect(destinationUrl.toString(), 302);
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
        GMAIL_SEND_SCOPE,
        GMAIL_SETTINGS_BASIC_SCOPE,
      ].join(" "),
      state: await createOAuthState(broker, capability, returnTo),
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
