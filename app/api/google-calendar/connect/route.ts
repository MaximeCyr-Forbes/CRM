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
import { GOOGLE_DRIVE_FILE_SCOPE } from "../../../lib/google-drive/scopes";
import {
  GOOGLE_CALENDAR_EVENTS_SCOPE,
  GOOGLE_CALENDAR_LIST_READONLY_SCOPE,
} from "../../../lib/google-calendar/scopes";

export const dynamic = "force-dynamic";

function capabilityScopes(capability: GoogleOAuthCapability) {
  if (capability === "gmail") return ["openid", "email", GMAIL_SEND_SCOPE, GMAIL_SETTINGS_BASIC_SCOPE];
  if (capability === "drive") return ["openid", "email", GOOGLE_DRIVE_FILE_SCOPE];
  return ["openid", "email", GOOGLE_CALENDAR_EVENTS_SCOPE, GOOGLE_CALENDAR_LIST_READONLY_SCOPE];
}

function capabilityFeedbackParameter(capability: GoogleOAuthCapability) {
  if (capability === "gmail") return "gmail";
  if (capability === "drive") return "drive";
  return "google";
}

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) {
    return access.response;
  }
  const requestUrl = new URL(request.url);
  const broker = requestUrl.searchParams.get("broker");
  const capabilityParam = requestUrl.searchParams.get("capability") ?? "calendar";
  if (capabilityParam !== "calendar" && capabilityParam !== "gmail" && capabilityParam !== "drive") {
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
      capability === "calendar"
        ? connection.centrisShowings.scopeGranted
        : capability === "gmail"
          ? connection.gmailSendEnabled && connection.gmailSignatureEnabled
          : connection.driveEnabled
    );
    if (capabilityAlreadyConnected) {
      const destinationUrl = new URL(returnTo, getApplicationOrigin(request));
      destinationUrl.searchParams.set(capabilityFeedbackParameter(capability), "already-connected");
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
      scope: capabilityScopes(capability).join(" "),
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
