import { withCRMIdentity } from '../../../lib/auth/route';
import { listGoogleConnectionStatuses } from "../../../lib/google-calendar/service";
import { requireApiAccess } from "../../../lib/crm-access";

export const dynamic = "force-dynamic";

async function GETHandler() {
  const access = await requireApiAccess();
  if (access.response) {
    return access.response;
  }
  try {
    return Response.json(
      { connections: await listGoogleConnectionStatuses() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Impossible de charger les connexions Google Agenda." },
      { status: 503 },
    );
  }
}

export const GET = withCRMIdentity(GETHandler);
