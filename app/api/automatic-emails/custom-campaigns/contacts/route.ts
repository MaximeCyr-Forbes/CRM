import { withCRMIdentity } from '../../../../lib/auth/route';
import { requireApiAccess } from "../../../../lib/crm-access";
import { listCustomEmailSelectableContacts } from "../../../../lib/automatic-emails/custom-campaign-persistence";

export const dynamic = "force-dynamic";

async function GETHandler() {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  try {
    return Response.json({ data: await listCustomEmailSelectableContacts(""), simulationOnly: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Erreur Contacts campagnes personnalisées:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Chargement des Contacts impossible." }, { status: 502 });
  }
}

export const GET = withCRMIdentity(GETHandler);
