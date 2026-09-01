import type { CalendarBroker } from "../../data/calendar-types";
import {
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  mapGoogleDriveRootRow,
  type GoogleDriveBreadcrumb,
  type GoogleDriveFolderListing,
  type GoogleDriveItem,
  type GoogleDriveRoot,
  type GoogleDriveRootRow,
  type GoogleDriveSearchResult,
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
  modifiedTime?: unknown;
  size?: unknown;
  iconLink?: unknown;
  thumbnailLink?: unknown;
  parents?: unknown;
};

type GoogleDriveFilesResponse = {
  files?: unknown;
  nextPageToken?: unknown;
};

type DriveFileWithParents = GoogleDriveItem & { parents: string[] };

const driveItemFields = "id,name,mimeType,modifiedTime,size,webViewLink,iconLink,thumbnailLink,driveId,parents";
const searchScanLimit = 5_000;
const searchResultLimit = 250;

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

export class GoogleDriveRootNotFoundError extends Error {
  constructor() {
    super("Le dossier partagé est introuvable.");
    this.name = "GoogleDriveRootNotFoundError";
  }
}

export class GoogleDriveAccessDeniedError extends Error {
  constructor() {
    super("Ce dossier ne fait pas partie des racines Google Drive autorisées.");
    this.name = "GoogleDriveAccessDeniedError";
  }
}

export class GoogleDriveItemUnavailableError extends Error {
  constructor() {
    super("Ce dossier Google Drive est inaccessible ou n’existe plus.");
    this.name = "GoogleDriveItemUnavailableError";
  }
}

async function requireDriveConnection(broker: CalendarBroker) {
  const connection = await getGoogleConnection(broker);
  if (!connection || !hasGoogleDriveFileScope(connection.scopes)) {
    throw new GoogleDriveAuthorizationRequiredError();
  }
  return connection;
}

function mapDriveFile(metadata: GoogleDriveFileMetadata): DriveFileWithParents {
  if (
    typeof metadata.id !== "string"
    || typeof metadata.name !== "string"
    || !metadata.name.trim()
    || typeof metadata.mimeType !== "string"
  ) {
    throw new Error("Métadonnées Google Drive invalides.");
  }
  return {
    id: metadata.id,
    name: metadata.name.trim(),
    mimeType: metadata.mimeType,
    modifiedTime: typeof metadata.modifiedTime === "string" ? metadata.modifiedTime : null,
    size: typeof metadata.size === "string" ? metadata.size : null,
    webViewLink: typeof metadata.webViewLink === "string" ? metadata.webViewLink : null,
    iconLink: typeof metadata.iconLink === "string" ? metadata.iconLink : null,
    thumbnailLink: typeof metadata.thumbnailLink === "string" ? metadata.thumbnailLink : null,
    driveId: typeof metadata.driveId === "string" ? metadata.driveId : null,
    isFolder: metadata.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE,
    parents: Array.isArray(metadata.parents)
      ? metadata.parents.filter((parent): parent is string => typeof parent === "string")
      : [],
  };
}

async function fetchDriveItem(
  connection: Awaited<ReturnType<typeof requireDriveConnection>>,
  itemId: string,
) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}`);
  url.search = new URLSearchParams({ fields: driveItemFields, supportsAllDrives: "true" }).toString();
  const response = await googleAuthenticatedRequest(connection, url.toString(), { method: "GET" });
  if (response.status === 401) throw new GoogleDriveAuthorizationRequiredError();
  if (response.status === 403 || response.status === 404) throw new GoogleDriveItemUnavailableError();
  if (!response.ok) throw new Error(`Lecture Google Drive refusée (${response.status}).`);
  return mapDriveFile((await response.json()) as GoogleDriveFileMetadata);
}

async function getGoogleDriveRoot(broker: CalendarBroker, rootId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("google_drive_roots")
    .select(rootColumns)
    .eq("id", rootId)
    .eq("broker", broker)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new GoogleDriveRootNotFoundError();
  return mapGoogleDriveRootRow(data as GoogleDriveRootRow);
}

async function listDriveChildren(
  connection: Awaited<ReturnType<typeof requireDriveConnection>>,
  folder: Pick<GoogleDriveItem, "id" | "driveId">,
) {
  const items: GoogleDriveItem[] = [];
  let pageToken: string | null = null;
  do {
    const search = new URLSearchParams({
      q: `'${folder.id}' in parents and trashed = false`,
      fields: `nextPageToken,files(${driveItemFields})`,
      pageSize: "1000",
      spaces: "drive",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (folder.driveId) {
      search.set("corpora", "drive");
      search.set("driveId", folder.driveId);
    }
    if (pageToken) search.set("pageToken", pageToken);
    const response = await googleAuthenticatedRequest(
      connection,
      `https://www.googleapis.com/drive/v3/files?${search.toString()}`,
      { method: "GET" },
    );
    if (response.status === 401) throw new GoogleDriveAuthorizationRequiredError();
    if (response.status === 403 || response.status === 404) throw new GoogleDriveItemUnavailableError();
    if (!response.ok) throw new Error(`Liste Google Drive refusée (${response.status}).`);
    const payload = (await response.json()) as GoogleDriveFilesResponse;
    if (!Array.isArray(payload.files)) throw new Error("Réponse Google Drive invalide.");
    items.push(...payload.files.map((item) => mapDriveFile(item as GoogleDriveFileMetadata)));
    pageToken = typeof payload.nextPageToken === "string" && payload.nextPageToken
      ? payload.nextPageToken
      : null;
  } while (pageToken);

  return items.sort((left, right) => {
    if (left.isFolder !== right.isFolder) return left.isFolder ? -1 : 1;
    return left.name.localeCompare(right.name, "fr-CA", { sensitivity: "base" });
  });
}

async function resolveAuthorizedFolder(
  connection: Awaited<ReturnType<typeof requireDriveConnection>>,
  root: GoogleDriveRoot,
  requestedFolderId: string,
) {
  const chain: DriveFileWithParents[] = [];
  const visited = new Set<string>();
  let current = await fetchDriveItem(connection, requestedFolderId);
  if (!current.isFolder) throw new GoogleDriveFolderRequiredError();

  for (let depth = 0; depth < 100; depth += 1) {
    if (visited.has(current.id)) throw new GoogleDriveAccessDeniedError();
    visited.add(current.id);
    chain.push(current);
    if (current.id === root.folderId) {
      return {
        folder: chain[0],
        breadcrumbs: chain
          .slice()
          .reverse()
          .map(({ id, name }): GoogleDriveBreadcrumb => ({ id, name })),
      };
    }
    const parentId = current.parents[0];
    if (!parentId) throw new GoogleDriveAccessDeniedError();
    current = await fetchDriveItem(connection, parentId);
  }
  throw new GoogleDriveAccessDeniedError();
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

export async function listAuthorizedGoogleDriveFolder(
  broker: CalendarBroker,
  rootId: string,
  folderId?: string,
): Promise<GoogleDriveFolderListing> {
  const [connection, root] = await Promise.all([
    requireDriveConnection(broker),
    getGoogleDriveRoot(broker, rootId),
  ]);
  const resolved = await resolveAuthorizedFolder(connection, root, folderId ?? root.folderId);
  return {
    root,
    folder: resolved.folder,
    breadcrumbs: resolved.breadcrumbs,
    items: await listDriveChildren(connection, resolved.folder),
  };
}

export async function searchAuthorizedGoogleDrive(
  broker: CalendarBroker,
  query: string,
): Promise<{ results: GoogleDriveSearchResult[]; truncated: boolean; unavailableRootIds: string[] }> {
  const normalizedQuery = query.trim().toLocaleLowerCase("fr-CA");
  if (!normalizedQuery) return { results: [], truncated: false, unavailableRootIds: [] };
  const [connection, roots] = await Promise.all([
    requireDriveConnection(broker),
    listGoogleDriveRoots(broker),
  ]);
  const results: GoogleDriveSearchResult[] = [];
  const unavailableRootIds: string[] = [];
  let scanned = 0;
  let truncated = false;

  for (const root of roots) {
    if (scanned >= searchScanLimit || results.length >= searchResultLimit) {
      truncated = true;
      break;
    }
    try {
      const rootFolder = await fetchDriveItem(connection, root.folderId);
      if (!rootFolder.isFolder) throw new GoogleDriveFolderRequiredError();
      const queue: Array<{ folder: GoogleDriveItem; breadcrumbs: GoogleDriveBreadcrumb[] }> = [{
        folder: rootFolder,
        breadcrumbs: [{ id: rootFolder.id, name: rootFolder.name }],
      }];
      const visited = new Set<string>();
      while (queue.length > 0 && scanned < searchScanLimit && results.length < searchResultLimit) {
        const current = queue.shift()!;
        if (visited.has(current.folder.id)) continue;
        visited.add(current.folder.id);
        const children = await listDriveChildren(connection, current.folder);
        for (const child of children) {
          scanned += 1;
          const childBreadcrumbs = child.isFolder
            ? [...current.breadcrumbs, { id: child.id, name: child.name }]
            : current.breadcrumbs;
          if (child.name.toLocaleLowerCase("fr-CA").includes(normalizedQuery)) {
            results.push({
              ...child,
              rootId: root.id,
              rootName: root.folderName,
              breadcrumbs: childBreadcrumbs,
            });
          }
          if (child.isFolder) queue.push({ folder: child, breadcrumbs: childBreadcrumbs });
          if (scanned >= searchScanLimit || results.length >= searchResultLimit) break;
        }
      }
      if (queue.length > 0) truncated = true;
    } catch (error) {
      if (
        error instanceof GoogleDriveItemUnavailableError
        || error instanceof GoogleDriveFolderRequiredError
      ) {
        unavailableRootIds.push(root.id);
        continue;
      }
      throw error;
    }
  }
  return { results, truncated, unavailableRootIds };
}
