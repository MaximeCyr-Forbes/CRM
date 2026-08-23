import { getApplicationOrigin, getGoogleRedirectUri } from "../../../lib/google-calendar/config";
import { verifyOAuthState } from "../../../lib/google-calendar/oauth-state";
import {
  exchangeGoogleAuthorizationCode,
  listGoogleConnectionStatuses,
  saveGoogleConnection,
} from "../../../lib/google-calendar/service";
import { requireApiAccess } from "../../../lib/crm-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");
  const applicationOrigin = getApplicationOrigin(request);
  const settingsUrl = new URL("/settings", applicationOrigin);

  const access = await requireApiAccess();
  if (access.response) {
    const loginUrl = new URL("/login", getApplicationOrigin(request));
    loginUrl.searchParams.set("returnTo", "/settings");
    return Response.redirect(loginUrl.toString(), 302);
  }

  if (!state) {
    settingsUrl.searchParams.set("google", "cancelled");
    return Response.redirect(settingsUrl.toString(), 302);
  }

  let destinationUrl = settingsUrl;
  let destinationCapability: "calendar" | "gmail" = "calendar";
  try {
    const { broker, capability, returnTo } = await verifyOAuthState(state);
    destinationCapability = capability;
    destinationUrl = new URL(returnTo, applicationOrigin);
    if (oauthError || !code) {
      destinationUrl.searchParams.set(capability === "gmail" ? "gmail" : "google", "cancelled");
      return Response.redirect(destinationUrl.toString(), 302);
    }
    const connections = await listGoogleConnectionStatuses();
    const connection = connections.find((item) => item.broker === broker);
    const capabilityAlreadyConnected = connection?.connected && (
      capability === "calendar" || connection.gmailSendEnabled
    );
    if (capabilityAlreadyConnected) {
      destinationUrl.searchParams.set(capability === "gmail" ? "gmail" : "google", "already-connected");
      destinationUrl.searchParams.set("broker", broker);
      return Response.redirect(destinationUrl.toString(), 302);
    }
    const tokens = await exchangeGoogleAuthorizationCode(
      code,
      getGoogleRedirectUri(request),
    );
    await saveGoogleConnection(broker, tokens);
    destinationUrl.searchParams.set(capability === "gmail" ? "gmail" : "google", "connected");
    destinationUrl.searchParams.set("broker", broker);
  } catch (caughtError) {
    console.error(
      "Erreur callback Google OAuth:",
      caughtError instanceof Error ? caughtError.message : "Erreur inconnue",
    );
    destinationUrl.searchParams.set(destinationCapability === "gmail" ? "gmail" : "google", "error");
  }

  return Response.redirect(destinationUrl.toString(), 302);
}
