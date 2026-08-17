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
  const settingsUrl = new URL("/settings", getApplicationOrigin(request));

  const access = await requireApiAccess();
  if (access.response) {
    const loginUrl = new URL("/login", getApplicationOrigin(request));
    loginUrl.searchParams.set("returnTo", "/settings");
    return Response.redirect(loginUrl.toString(), 302);
  }

  if (oauthError || !code || !state) {
    settingsUrl.searchParams.set("google", "cancelled");
    return Response.redirect(settingsUrl.toString(), 302);
  }

  try {
    const { broker } = await verifyOAuthState(state);
    const connections = await listGoogleConnectionStatuses();
    if (connections.some((connection) => connection.broker === broker && connection.connected)) {
      settingsUrl.searchParams.set("google", "already-connected");
      settingsUrl.searchParams.set("broker", broker);
      return Response.redirect(settingsUrl.toString(), 302);
    }
    const tokens = await exchangeGoogleAuthorizationCode(
      code,
      getGoogleRedirectUri(request),
    );
    await saveGoogleConnection(broker, tokens);
    settingsUrl.searchParams.set("google", "connected");
    settingsUrl.searchParams.set("broker", broker);
  } catch {
    settingsUrl.searchParams.set("google", "error");
  }

  return Response.redirect(settingsUrl.toString(), 302);
}
