import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { setCRMAccessCookie, verifyCRMPassword } from "../../../lib/crm-access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  if (typeof body?.password !== "string") {
    return Response.json({ error: "Mot de passe incorrect" }, { status: 401 });
  }
  try {
    if (!(await verifyCRMPassword(body.password))) {
      return Response.json({ error: "Mot de passe incorrect" }, { status: 401 });
    }
    await setCRMAccessCookie();
    return Response.json(
      { authenticated: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json({ error: "Accès temporairement indisponible." }, { status: 503 });
  }
}
