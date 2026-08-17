import { hasCRMAccess } from "../../../lib/crm-access";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { authenticated: await hasCRMAccess() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
