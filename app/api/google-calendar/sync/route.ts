import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { syncContactsFollowUps } from "../../../lib/google-calendar/service";
import { requireApiAccess } from "../../../lib/crm-access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) {
    return access.response;
  }
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    contactIds?: unknown;
  } | null;
  const contactIds = Array.isArray(body?.contactIds)
    ? body.contactIds.filter(
        (contactId): contactId is string =>
          typeof contactId === "string" && contactId.length > 0,
      )
    : [];
  if (contactIds.length === 0 || contactIds.length > 500) {
    return Response.json({ error: "Liste de contacts invalide." }, { status: 400 });
  }

  try {
    return Response.json({ results: await syncContactsFollowUps(contactIds) });
  } catch {
    return Response.json(
      { error: "Synchronisation Google Agenda indisponible." },
      { status: 502 },
    );
  }
}
