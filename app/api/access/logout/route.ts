import { clearCRMAccessCookie } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }
  await clearCRMAccessCookie();
  return Response.json(
    { authenticated: false },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
