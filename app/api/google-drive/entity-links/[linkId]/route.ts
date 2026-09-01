import { isGoogleDriveEntityId } from "../../../../data/google-drive-types";
import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import { removeGoogleDriveEntityLink } from "../../../../lib/google-drive/service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ linkId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const { linkId } = await context.params;
  if (!isGoogleDriveEntityId(linkId)) return Response.json({ error: "Lien Drive invalide." }, { status: 400 });
  try {
    if (!await removeGoogleDriveEntityLink(linkId)) return Response.json({ error: "Lien Drive introuvable." }, { status: 404 });
    return Response.json({ data: { linkId } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Retrait du lien Drive impossible:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json(
      { error: "Le lien Drive n’a pas pu être retiré." },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
