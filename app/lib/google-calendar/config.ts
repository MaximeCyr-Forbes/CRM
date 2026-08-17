export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const stateSecret = process.env.GOOGLE_OAUTH_STATE_SECRET?.trim();

  if (!clientId || !clientSecret || !stateSecret) {
    throw new Error("Configuration Google OAuth incomplète.");
  }

  return { clientId, clientSecret, stateSecret };
}

export function getApplicationOrigin(request: Request) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (configuredOrigin || new URL(request.url).origin).replace(/\/$/, "");
}

export function getGoogleRedirectUri(request: Request) {
  return `${getApplicationOrigin(request)}/api/google-calendar/callback`;
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("Origin");
  return Boolean(origin && origin.replace(/\/$/, "") === getApplicationOrigin(request));
}
