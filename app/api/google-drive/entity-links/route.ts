import { isCalendarBroker } from "../../../data/calendar-types";
import {
  isGoogleDriveEntityId,
  isGoogleDriveEntityType,
  isGoogleDriveFolderId,
  isGoogleDriveRootId,
} from "../../../data/google-drive-types";
import { requireApiAccess } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import {
  addGoogleDriveEntityLink,
  GoogleDriveAccessDeniedError,
  GoogleDriveAuthorizationRequiredError,
  GoogleDriveEntityNotFoundError,
  GoogleDriveEntityUnassignedError,
  GoogleDriveFolderRequiredError,
  GoogleDriveItemUnavailableError,
  GoogleDriveRootNotFoundError,
  listGoogleDriveEntityLinks,
} from "../../../lib/google-drive/service";

export const dynamic = "force-dynamic";

function json(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const search = new URL(request.url).searchParams;
  const broker = search.get("broker");
  const entityType = search.get("entityType");
  const entityId = search.get("entityId");

  if (broker !== null) {
    if (!isCalendarBroker(broker) || entityType !== null || entityId !== null) return json("Filtres Drive invalides.", 400);
    try {
      return Response.json({ links: await listGoogleDriveEntityLinks({ broker }) }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      console.error("Chargement des liens Drive impossible:", error instanceof Error ? error.message : "erreur inconnue");
      return json("Les liens Drive sont temporairement indisponibles.", 502);
    }
  }

  if (!isGoogleDriveEntityType(entityType) || !isGoogleDriveEntityId(entityId)) return json("Dossier CRM invalide.", 400);
  try {
    return Response.json(
      { links: await listGoogleDriveEntityLinks({ entityType, entityId }) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Chargement des liens Drive impossible:", error instanceof Error ? error.message : "erreur inconnue");
    return json("Les liens Drive sont temporairement indisponibles.", 502);
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return json("Origine refusée.", 403);
  const body = await request.json().catch(() => null) as {
    entityType?: unknown;
    entityId?: unknown;
    rootId?: unknown;
    folderId?: unknown;
  } | null;
  if (!body) return json("Requête invalide.", 400);
  if (!isGoogleDriveEntityType(body.entityType) || !isGoogleDriveEntityId(body.entityId)) return json("Dossier CRM invalide.", 400);
  if (!isGoogleDriveRootId(body.rootId) || !isGoogleDriveFolderId(body.folderId)) return json("Dossier Google Drive invalide.", 400);

  try {
    const link = await addGoogleDriveEntityLink({
      entityType: body.entityType,
      entityId: body.entityId,
      rootId: body.rootId,
      folderId: body.folderId,
    });
    return Response.json({ link }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof GoogleDriveEntityNotFoundError || error instanceof GoogleDriveRootNotFoundError) return json(error.message, 404);
    if (error instanceof GoogleDriveEntityUnassignedError || error instanceof GoogleDriveAuthorizationRequiredError) return json(error.message, 409);
    if (error instanceof GoogleDriveAccessDeniedError) return json(error.message, 403);
    if (error instanceof GoogleDriveFolderRequiredError) return json(error.message, 400);
    if (error instanceof GoogleDriveItemUnavailableError) return json(error.message, 404);
    console.error("Création du lien Drive impossible:", error instanceof Error ? error.message : "erreur inconnue");
    return json("Le dossier Drive n’a pas pu être lié.", 502);
  }
}
