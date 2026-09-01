import type { CalendarBroker } from "../../data/calendar-types";
import {
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  mapGoogleDriveRootRow,
  type GoogleDriveRoot,
  type GoogleDriveRootRow,
} from "../../data/google-drive-types";
import { getGoogleAccessToken, getGoogleConnection, googleAuthenticatedRequest } from "../google/connection";
import { getSupabaseAdmin } from "../supabase/server";
import { hasGoogleDriveFileScope } from "./scopes";

const rootColumns = "id, broker, folder_id, folder_name, drive_id, web_view_link, created_at, updated_at";

type GoogleDriveFileMetadata = {
  id?: unknown;
  name?: unknown;
  mimeType?: unknown;
  driveId?: unknown;
  webViewLink?: unknown;
};

export class GoogleDriveAuthorizationRequiredError extends Error {
  constructor() {
    super("L’autorisation Google Drive est requise pour ce courtier.");
    this.name = "GoogleDriveAuthorizationRequiredError";
  }
}

export class GoogleDriveFolderRequiredError extends Error {
  constructor() {
    super("L’élément sélectionné doit être un dossier Google Drive.");
    this.name = "GoogleDriveFolderRequiredError";
  }
}

async function requireDriveConnection(broker: CalendarBroker) {
  const connection = await getGoogleConnection(broker);
  if (!connection || !hasGoogleDriveFileScope(connection.scopes)) {
    throw new GoogleDriveAuthorizationRequiredError();
  }
  return connection;
}

export async function getGoogleDrivePickerAccessToken(broker: CalendarBroker) {
  return getGoogleAccessToken(await requireDriveConnection(broker));
}

export async function getGoogleDriveFolderMetadata(
  broker: CalendarBroker,
  folderId: string,
) {
  const connection = await requireDriveConnection(broker);
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}`);
  url.search = new URLSearchParams({
    fields: "id,name,mimeType,driveId,webViewLink",
    supportsAllDrives: "true",
  }).toString();
  const response = await googleAuthenticatedRequest(connection, url.toString(), { method: "GET" });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new GoogleDriveAuthorizationRequiredError();
    }
    throw new Error(`Lecture du dossier Google Drive refusée (${response.status}).`);
  }
  const metadata = (await response.json()) as GoogleDriveFileMetadata;
  if (metadata.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
    throw new GoogleDriveFolderRequiredError();
  }
  if (typeof metadata.id !== "string" || typeof metadata.name !== "string" || !metadata.name.trim()) {
    throw new Error("Métadonnées Google Drive invalides.");
  }
  return {
    id: metadata.id,
    name: metadata.name.trim(),
    driveId: typeof metadata.driveId === "string" ? metadata.driveId : null,
    webViewLink: typeof metadata.webViewLink === "string" ? metadata.webViewLink : null,
  };
}

export async function listGoogleDriveRoots(broker: CalendarBroker): Promise<GoogleDriveRoot[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("google_drive_roots")
    .select(rootColumns)
    .eq("broker", broker)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as GoogleDriveRootRow[]).map(mapGoogleDriveRootRow);
}

export async function addGoogleDriveRoot(
  broker: CalendarBroker,
  folderId: string,
): Promise<GoogleDriveRoot> {
  const metadata = await getGoogleDriveFolderMetadata(broker, folderId);
  const { data, error } = await getSupabaseAdmin()
    .from("google_drive_roots")
    .upsert({
      broker,
      folder_id: metadata.id,
      folder_name: metadata.name,
      drive_id: metadata.driveId,
      web_view_link: metadata.webViewLink,
    }, { onConflict: "broker,folder_id" })
    .select(rootColumns)
    .single();
  if (error) throw error;
  return mapGoogleDriveRootRow(data as GoogleDriveRootRow);
}

export async function removeGoogleDriveRoot(
  broker: CalendarBroker,
  rootId: string,
) {
  const { data, error } = await getSupabaseAdmin()
    .from("google_drive_roots")
    .delete()
    .eq("id", rootId)
    .eq("broker", broker)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
