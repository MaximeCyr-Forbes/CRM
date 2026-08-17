import { deleteContactAndCalendar } from "../../../lib/contacts/server-service";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { requireApiAccess } from "../../../lib/crm-access";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ contactId: string }> },
) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }
  const { contactId } = await context.params;
  if (!contactId) return Response.json({ error: "Contact invalide." }, { status: 400 });

  try {
    await deleteContactAndCalendar(contactId);
    return Response.json({ deleted: true });
  } catch {
    return Response.json(
      { error: "Suppression impossible sans laisser de donnée orpheline." },
      { status: 502 },
    );
  }
}
