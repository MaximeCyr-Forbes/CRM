import { isCalendarBroker } from "../../../data/calendar-types";
import { isGoogleDriveFolderId, isGoogleDriveRootId } from "../../../data/google-drive-types";
import { requireApiAccess } from "../../../lib/crm-access";
import {
  GoogleDriveAccessDeniedError,
  GoogleDriveAuthorizationRequiredError,
  GoogleDriveFolderRequiredError,
  GoogleDriveItemUnavailableError,
  GoogleDriveRootNotFoundError,
  listAuthorizedGoogleDriveFolder,
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
  const rootId = search.get("rootId");
  const folderId = search.get("folderId");
  if (!isCalendarBroker(broker)) return json("Courtier invalide.", 400);
  if (!isGoogleDriveRootId(rootId)) return json("Dossier partagé invalide.", 400);
  if (folderId !== null && !isGoogleDriveFolderId(folderId)) return json("Dossier Google Drive invalide.", 400);

  try {
    return Response.json(
      { data: await listAuthorizedGoogleDriveFolder(broker, rootId, folderId ?? undefined) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof GoogleDriveAuthorizationRequiredError) return json(error.message, 409);
    if (error instanceof GoogleDriveRootNotFoundError) return json(error.message, 404);
    if (error instanceof GoogleDriveAccessDeniedError) return json(error.message, 403);
    if (error instanceof GoogleDriveFolderRequiredError) return json(error.message, 400);
    if (error instanceof GoogleDriveItemUnavailableError) return json(error.message, 404);
    console.error("Navigation Google Drive impossible:", error instanceof Error ? error.message : "erreur inconnue");
    return json("Google Drive est temporairement indisponible.", 502);
  }
}
