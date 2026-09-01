import { isCalendarBroker } from "../../../data/calendar-types";
import { isGoogleDriveFolderId } from "../../../data/google-drive-types";
import { requireApiAccess } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import {
  addGoogleDriveRoot,
  GoogleDriveAuthorizationRequiredError,
  GoogleDriveFolderRequiredError,
  GoogleDrivePermissionCreationError,
  GoogleDriveServiceAccountSharingBlockedError,
  listGoogleDriveRoots,
} from "../../../lib/google-drive/service";
import { GoogleDriveServiceAccountConfigurationError } from "../../../lib/google-drive/service-account";

export const dynamic = "force-dynamic";

function json(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const broker = new URL(request.url).searchParams.get("broker");
  if (!isCalendarBroker(broker)) return json("Courtier invalide.", 400);

  try {
    return Response.json(
      { roots: await listGoogleDriveRoots(broker) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error(
      "Chargement des dossiers Google Drive impossible:",
      error instanceof Error ? error.message : "erreur inconnue",
    );
    return json("Les dossiers Google Drive sont temporairement indisponibles.", 502);
  }
}

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return json("Origine refusée.", 403);

  let body: { broker?: unknown; folderId?: unknown };
  try {
    body = (await request.json()) as { broker?: unknown; folderId?: unknown };
  } catch {
    return json("Requête invalide.", 400);
  }
  if (!isCalendarBroker(body.broker)) return json("Courtier invalide.", 400);
  if (!isGoogleDriveFolderId(body.folderId)) return json("Dossier Google Drive invalide.", 400);

  try {
    return Response.json(
      { root: await addGoogleDriveRoot(body.broker, body.folderId) },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof GoogleDriveAuthorizationRequiredError) return json(error.message, 409);
    if (error instanceof GoogleDriveFolderRequiredError) return json(error.message, 400);
    if (error instanceof GoogleDriveServiceAccountSharingBlockedError) return json(error.message, 403);
    if (error instanceof GoogleDrivePermissionCreationError) return json(error.message, 502);
    if (error instanceof GoogleDriveServiceAccountConfigurationError) return json(error.message, 503);
    console.error(
      "Ajout du dossier Google Drive impossible:",
      error instanceof Error ? error.message : "erreur inconnue",
    );
    return json("Le dossier Google Drive n’a pas pu être ajouté.", 502);
  }
}
