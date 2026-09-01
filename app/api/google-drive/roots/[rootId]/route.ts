import { isCalendarBroker } from "../../../../data/calendar-types";
import { isGoogleDriveRootId } from "../../../../data/google-drive-types";
import { requireApiAccess } from "../../../../lib/crm-access";
import { isSameOriginRequest } from "../../../../lib/google-calendar/config";
import {
  GoogleDriveAuthorizationRequiredError,
  GoogleDrivePermissionRevocationError,
  removeGoogleDriveRoot,
} from "../../../../lib/google-drive/service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ rootId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Origine refusée." }, { status: 403 });
  }
  const broker = new URL(request.url).searchParams.get("broker");
  const { rootId } = await context.params;
  if (!isCalendarBroker(broker)) {
    return Response.json({ error: "Courtier invalide." }, { status: 400 });
  }
  if (!isGoogleDriveRootId(rootId)) {
    return Response.json({ error: "Dossier partagé invalide." }, { status: 400 });
  }

  try {
    if (!await removeGoogleDriveRoot(broker, rootId)) {
      return Response.json({ error: "Dossier partagé introuvable." }, { status: 404 });
    }
    return Response.json(
      { data: { rootId } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof GoogleDriveAuthorizationRequiredError) {
      return Response.json(
        { error: error.message },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (error instanceof GoogleDrivePermissionRevocationError) {
      return Response.json(
        { error: error.message },
        { status: 502, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    console.error(
      "Retrait du dossier Google Drive impossible:",
      error instanceof Error ? error.message : "erreur inconnue",
    );
    return Response.json(
      { error: "La permission Google n’a pas pu être révoquée; le dossier reste autorisé dans le CRM." },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
