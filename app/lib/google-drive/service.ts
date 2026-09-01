import { isCalendarBroker, type CalendarBroker } from "../../data/calendar-types";
import {
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  mapGoogleDriveRootRow,
  type GoogleDriveBreadcrumb,
  type GoogleDriveEntityLink,
  type GoogleDriveEntityLinkRow,
  type GoogleDriveEntityType,
  type GoogleDriveFolderListing,
  type GoogleDriveItem,
  type GoogleDriveRoot,
  type GoogleDriveRootRow,
  type GoogleDriveSearchResult,
} from "../../data/google-drive-types";
import { getGoogleAccessToken, getGoogleConnection, googleAuthenticatedRequest } from "../google/connection";
import { listAllSupabaseRows, mapWithConcurrency, type SupabaseOrderedRangeQuery } from "../supabase/pagination";
import { getSupabaseAdmin } from "../supabase/server";
import { hasGoogleDriveFileScope } from "./scopes";
import {
  getGoogleDriveServiceAccountEmail,
  serviceAccountGoogleDriveRequest,
} from "./service-account";

const rootColumns = "id, broker, folder_id, folder_name, drive_id, web_view_link, google_permission_id, created_at, updated_at";
const entityLinkColumns = "id, broker, root_id, folder_id, folder_name, web_view_link, contact_id, listing_id, transaction_id, created_at";

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
  incompleteSearch?: unknown;
};

type DriveFileWithParents = GoogleDriveItem & { parents: string[] };

const driveItemFields = "id,name,mimeType,modifiedTime,size,webViewLink,iconLink,thumbnailLink,driveId,parents";
const searchResultLimit = 250;
const searchCandidateLimit = 1_000;
const searchPageSize = 100;
const searchTimeoutMs = 4_500;
const searchValidationConcurrency = 8;
const searchAncestryDepthLimit = 100;

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

export class GoogleDriveServiceAccountSharingBlockedError extends Error {
  constructor() {
    super("SERVICE ACCOUNT SHARING BLOCKED BY WORKSPACE POLICY");
    this.name = "GoogleDriveServiceAccountSharingBlockedError";
  }
}

export class GoogleDrivePermissionCreationError extends Error {
  constructor() {
    super("La permission de lecture Google Drive n’a pas pu être accordée au CRM.");
    this.name = "GoogleDrivePermissionCreationError";
  }
}

export class GoogleDrivePermissionRevocationError extends Error {
  constructor() {
    super("La permission Google Drive n’a pas pu être révoquée; le dossier reste autorisé dans le CRM.");
    this.name = "GoogleDrivePermissionRevocationError";
  }
}

export class GoogleDriveEntityNotFoundError extends Error {
  constructor() {
    super("Le dossier CRM est introuvable.");
    this.name = "GoogleDriveEntityNotFoundError";
  }
}

export class GoogleDriveEntityUnassignedError extends Error {
  constructor() {
    super("Un courtier doit être attribué avant de lier un dossier Drive.");
    this.name = "GoogleDriveEntityUnassignedError";
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
  itemId: string,
  signal?: AbortSignal,
) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(itemId)}`);
  url.search = new URLSearchParams({ fields: driveItemFields, supportsAllDrives: "true" }).toString();
  const response = await serviceAccountGoogleDriveRequest(url.toString(), { method: "GET", signal });
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
  folder: Pick<GoogleDriveItem, "id" | "driveId">,
) {
  const items: DriveFileWithParents[] = [];
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
    const response = await serviceAccountGoogleDriveRequest(
      `https://www.googleapis.com/drive/v3/files?${search.toString()}`,
      { method: "GET" },
    );
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
  root: GoogleDriveRoot,
  requestedFolderId: string,
) {
  const chain: DriveFileWithParents[] = [];
  const visited = new Set<string>();
  let current = await fetchDriveItem(requestedFolderId);
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
    if (!parentId) break;
    current = await fetchDriveItem(parentId);
  }

  // Google Drive can omit `parents` from inherited shared-folder metadata even
  // though the service account can list the folder through the authorized root.
  // In that case, rebuild the ancestry from the root downward. This also keeps
  // the CRM boundary explicit: only descendants discovered under this root can
  // be opened.
  const rootFolder = await fetchDriveItem(root.folderId);
  const pending: Array<{ folder: DriveFileWithParents; breadcrumbs: GoogleDriveBreadcrumb[] }> = [{
    folder: rootFolder,
    breadcrumbs: [{ id: rootFolder.id, name: rootFolder.name }],
  }];
  const traversed = new Set<string>();

  while (pending.length > 0 && traversed.size < 20_000) {
    const entry = pending.shift();
    if (!entry || traversed.has(entry.folder.id)) continue;
    traversed.add(entry.folder.id);

    const children = await listDriveChildren(entry.folder);
    for (const child of children) {
      if (!child.isFolder || traversed.has(child.id)) continue;
      const breadcrumbs = [...entry.breadcrumbs, { id: child.id, name: child.name }];
      if (child.id === requestedFolderId) {
        return { folder: child, breadcrumbs };
      }
      pending.push({ folder: child, breadcrumbs });
    }
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

async function findGoogleDriveRootByFolder(
  broker: CalendarBroker,
  folderId: string,
) {
  const { data, error } = await getSupabaseAdmin()
    .from("google_drive_roots")
    .select(rootColumns)
    .eq("broker", broker)
    .eq("folder_id", folderId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapGoogleDriveRootRow(data as GoogleDriveRootRow) : null;
}

function isWorkspaceSharingPolicyError(details: string) {
  return /domainPolicy|adminPolicy|sharing[^\n]*(disabled|blocked)|outside[^\n]*domain|workspace[^\n]*policy/i.test(details);
}

async function createServiceAccountReaderPermission(
  connection: Awaited<ReturnType<typeof requireDriveConnection>>,
  folderId: string,
) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions`);
  url.search = new URLSearchParams({
    supportsAllDrives: "true",
    sendNotificationEmail: "false",
    fields: "id",
  }).toString();
  const response = await googleAuthenticatedRequest(connection, url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "user",
      role: "reader",
      emailAddress: getGoogleDriveServiceAccountEmail(),
    }),
  });
  if (response.status === 401) throw new GoogleDriveAuthorizationRequiredError();
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    if (response.status === 403 && isWorkspaceSharingPolicyError(details)) {
      throw new GoogleDriveServiceAccountSharingBlockedError();
    }
    throw new GoogleDrivePermissionCreationError();
  }
  const payload = await response.json() as { id?: unknown };
  if (typeof payload.id !== "string" || !payload.id) throw new GoogleDrivePermissionCreationError();
  return payload.id;
}

async function findServiceAccountReaderPermission(
  connection: Awaited<ReturnType<typeof requireDriveConnection>>,
  folderId: string,
) {
  let pageToken: string | null = null;
  const serviceAccountEmail = getGoogleDriveServiceAccountEmail().toLowerCase();
  do {
    const search = new URLSearchParams({
      supportsAllDrives: "true",
      fields: "nextPageToken,permissions(id,type,role,emailAddress,deleted)",
      pageSize: "100",
    });
    if (pageToken) search.set("pageToken", pageToken);
    const response = await googleAuthenticatedRequest(
      connection,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions?${search.toString()}`,
      { method: "GET" },
    );
    if (response.status === 401) throw new GoogleDriveAuthorizationRequiredError();
    if (!response.ok) throw new GoogleDrivePermissionCreationError();
    const payload = await response.json() as {
      nextPageToken?: unknown;
      permissions?: Array<Record<string, unknown>>;
    };
    const permission = (payload.permissions ?? []).find((candidate) => (
      candidate.type === "user"
      && candidate.role === "reader"
      && candidate.deleted !== true
      && typeof candidate.emailAddress === "string"
      && candidate.emailAddress.toLowerCase() === serviceAccountEmail
      && typeof candidate.id === "string"
      && candidate.id.length > 0
    ));
    if (permission && typeof permission.id === "string") return permission.id;
    pageToken = typeof payload.nextPageToken === "string" && payload.nextPageToken
      ? payload.nextPageToken
      : null;
  } while (pageToken);
  return null;
}

async function revokeServiceAccountReaderPermission(
  connection: Awaited<ReturnType<typeof requireDriveConnection>>,
  folderId: string,
  permissionId: string,
) {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions/${encodeURIComponent(permissionId)}`,
  );
  url.search = new URLSearchParams({ supportsAllDrives: "true" }).toString();
  const response = await googleAuthenticatedRequest(connection, url.toString(), { method: "DELETE" });
  if (response.status === 401) throw new GoogleDriveAuthorizationRequiredError();
  if (response.status === 404) return;
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("Révocation de la permission Google Drive impossible", {
      status: response.status,
      details,
    });
    throw new GoogleDrivePermissionRevocationError();
  }
}

async function verifyServiceAccountCanReadFolder(folderId: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const folder = await fetchDriveItem(folderId);
      if (!folder.isFolder) throw new GoogleDriveFolderRequiredError();
      return;
    } catch (error) {
      lastError = error;
      if (!(error instanceof GoogleDriveItemUnavailableError) || attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function addGoogleDriveRoot(
  broker: CalendarBroker,
  folderId: string,
): Promise<GoogleDriveRoot> {
  const connection = await requireDriveConnection(broker);
  const metadata = await getGoogleDriveFolderMetadata(broker, folderId);
  const existing = await findGoogleDriveRootByFolder(broker, metadata.id);
  if (existing?.googlePermissionId) return existing;

  const existingPermissionId = await findServiceAccountReaderPermission(connection, metadata.id);
  const permissionId = existingPermissionId
    ?? await createServiceAccountReaderPermission(connection, metadata.id);
  const permissionWasCreated = existingPermissionId === null;
  try {
    await verifyServiceAccountCanReadFolder(metadata.id);
  } catch (error) {
    if (permissionWasCreated) {
      await revokeServiceAccountReaderPermission(connection, metadata.id, permissionId).catch(() => undefined);
    }
    throw error;
  }
  const { data, error } = await getSupabaseAdmin()
    .from("google_drive_roots")
    .upsert({
      broker,
      folder_id: metadata.id,
      folder_name: metadata.name,
      drive_id: metadata.driveId,
      web_view_link: metadata.webViewLink,
      google_permission_id: permissionId,
    }, { onConflict: "broker,folder_id" })
    .select(rootColumns)
    .single();
  if (error) {
    if (permissionWasCreated) {
      await revokeServiceAccountReaderPermission(connection, metadata.id, permissionId).catch(() => undefined);
    }
    throw error;
  }
  return mapGoogleDriveRootRow(data as GoogleDriveRootRow);
}

export async function removeGoogleDriveRoot(
  broker: CalendarBroker,
  rootId: string,
) {
  let root: GoogleDriveRoot;
  try {
    root = await getGoogleDriveRoot(broker, rootId);
  } catch (error) {
    if (error instanceof GoogleDriveRootNotFoundError) return false;
    throw error;
  }
  if (root.googlePermissionId) {
    const connection = await requireDriveConnection(broker);
    await revokeServiceAccountReaderPermission(
      connection,
      root.folderId,
      root.googlePermissionId,
    );
  }
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
  const root = await getGoogleDriveRoot(broker, rootId);
  const resolved = await resolveAuthorizedFolder(root, folderId ?? root.folderId);
  return {
    root,
    folder: resolved.folder,
    breadcrumbs: resolved.breadcrumbs,
    items: await listDriveChildren(resolved.folder),
  };
}

export async function getAuthorizedGoogleDriveFolder(
  broker: CalendarBroker,
  rootId: string,
  folderId: string,
) {
  const root = await getGoogleDriveRoot(broker, rootId);
  const resolved = await resolveAuthorizedFolder(root, folderId);
  return { root, folder: resolved.folder, breadcrumbs: resolved.breadcrumbs };
}

export async function searchAuthorizedGoogleDrive(
  broker: CalendarBroker,
  query: string,
): Promise<{ results: GoogleDriveSearchResult[]; truncated: boolean; unavailableRootIds: string[] }> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return { results: [], truncated: false, unavailableRootIds: [] };
  const roots = await listGoogleDriveRoots(broker);
  if (roots.length === 0) return { results: [], truncated: false, unavailableRootIds: [] };

  const results: GoogleDriveSearchResult[] = [];
  const unavailableRootIds: string[] = [];
  let truncated = false;
  let candidateCount = 0;
  let pageToken: string | null = null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), searchTimeoutMs);
  const rootsByFolderId = new Map<string, GoogleDriveRoot>();
  const itemCache = new Map<string, Promise<DriveFileWithParents | null>>();
  const ancestryCache = new Map<string, Promise<{
    root: GoogleDriveRoot;
    breadcrumbs: GoogleDriveBreadcrumb[];
  } | null>>();

  const isAbortError = (error: unknown) => error instanceof Error && error.name === "AbortError";
  const loadItem = (itemId: string) => {
    const cached = itemCache.get(itemId);
    if (cached) return cached;
    const pending = fetchDriveItem(itemId, controller.signal).catch((error) => {
      if (error instanceof GoogleDriveItemUnavailableError) return null;
      throw error;
    });
    itemCache.set(itemId, pending);
    return pending;
  };
  const resolveItemRoot = (
    item: DriveFileWithParents,
    depth = 0,
  ): Promise<{ root: GoogleDriveRoot; breadcrumbs: GoogleDriveBreadcrumb[] } | null> => {
    const directRoot = rootsByFolderId.get(item.id);
    if (directRoot) {
      return Promise.resolve({
        root: directRoot,
        breadcrumbs: [{ id: item.id, name: item.name }],
      });
    }
    const cached = ancestryCache.get(item.id);
    if (cached) return cached;
    const pending = (async () => {
      if (depth >= searchAncestryDepthLimit) return null;
      for (const parentId of item.parents) {
        const root = rootsByFolderId.get(parentId);
        if (root) {
          return {
            root,
            breadcrumbs: [
              { id: root.folderId, name: root.folderName },
              { id: item.id, name: item.name },
            ],
          };
        }
        const parent = await loadItem(parentId);
        if (!parent) continue;
        const parentResolution = await resolveItemRoot(parent, depth + 1);
        if (parentResolution) {
          return {
            root: parentResolution.root,
            breadcrumbs: [
              ...parentResolution.breadcrumbs,
              { id: item.id, name: item.name },
            ],
          };
        }
      }
      return null;
    })();
    ancestryCache.set(item.id, pending);
    return pending;
  };

  try {
    const rootStates = await mapWithConcurrency(roots, 5, async (root) => {
      try {
        const folder = await fetchDriveItem(root.folderId, controller.signal);
        if (!folder.isFolder) throw new GoogleDriveFolderRequiredError();
        return { root, folder };
      } catch (error) {
        if (
          error instanceof GoogleDriveItemUnavailableError
          || error instanceof GoogleDriveFolderRequiredError
        ) {
          unavailableRootIds.push(root.id);
          return null;
        }
        if (isAbortError(error)) {
          truncated = true;
          return null;
        }
        throw error;
      }
    });
    for (const state of rootStates) {
      if (!state) continue;
      rootsByFolderId.set(state.root.folderId, state.root);
      itemCache.set(state.folder.id, Promise.resolve(state.folder));
    }
    if (rootsByFolderId.size === 0 || controller.signal.aborted) {
      return { results, truncated, unavailableRootIds };
    }

    const escapedQuery = normalizedQuery.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    do {
      if (controller.signal.aborted || candidateCount >= searchCandidateLimit) {
        truncated = true;
        break;
      }
      const search = new URLSearchParams({
        q: `name contains '${escapedQuery}' and trashed = false`,
        fields: `nextPageToken,incompleteSearch,files(${driveItemFields})`,
        pageSize: String(searchPageSize),
        spaces: "drive",
        corpora: "user",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) search.set("pageToken", pageToken);
      const response = await serviceAccountGoogleDriveRequest(
        `https://www.googleapis.com/drive/v3/files?${search.toString()}`,
        { method: "GET", signal: controller.signal },
      );
      if (!response.ok) throw new Error(`Recherche Google Drive refusée (${response.status}).`);
      const payload = (await response.json()) as GoogleDriveFilesResponse;
      if (!Array.isArray(payload.files)) throw new Error("Réponse de recherche Google Drive invalide.");
      const candidates = payload.files
        .slice(0, Math.max(0, searchCandidateLimit - candidateCount))
        .map((item) => mapDriveFile(item as GoogleDriveFileMetadata));
      candidateCount += candidates.length;
      for (const candidate of candidates) itemCache.set(candidate.id, Promise.resolve(candidate));

      const validated = await mapWithConcurrency(candidates, searchValidationConcurrency, async (candidate) => {
        try {
          const resolution = await resolveItemRoot(candidate);
          if (!resolution) return null;
          return {
            ...candidate,
            rootId: resolution.root.id,
            rootName: resolution.root.folderName,
            breadcrumbs: candidate.isFolder
              ? resolution.breadcrumbs
              : resolution.breadcrumbs.slice(0, -1),
          } satisfies GoogleDriveSearchResult;
        } catch (error) {
          if (isAbortError(error) || error instanceof GoogleDriveItemUnavailableError) {
            truncated = truncated || isAbortError(error);
            return null;
          }
          throw error;
        }
      });
      for (const result of validated) {
        if (!result) continue;
        results.push(result);
        if (results.length >= searchResultLimit) {
          truncated = true;
          break;
        }
      }
      if (payload.incompleteSearch === true) truncated = true;
      pageToken = typeof payload.nextPageToken === "string" && payload.nextPageToken
        ? payload.nextPageToken
        : null;
    } while (pageToken && results.length < searchResultLimit);
  } catch (error) {
    if (isAbortError(error)) truncated = true;
    else throw error;
  } finally {
    clearTimeout(timeout);
  }

  return {
    results: results
      .slice(0, searchResultLimit)
      .sort((left, right) => left.name.localeCompare(right.name, "fr-CA", { sensitivity: "base" })),
    truncated,
    unavailableRootIds,
  };
}

const entityColumn: Record<GoogleDriveEntityType, "contact_id" | "listing_id" | "transaction_id"> = {
  contact: "contact_id",
  listing: "listing_id",
  transaction: "transaction_id",
};

function entityIdentity(row: GoogleDriveEntityLinkRow) {
  if (row.contact_id) return { entityType: "contact" as const, entityId: row.contact_id };
  if (row.listing_id) return { entityType: "listing" as const, entityId: row.listing_id };
  if (row.transaction_id) return { entityType: "transaction" as const, entityId: row.transaction_id };
  throw new Error("Lien Google Drive sans dossier CRM.");
}

function mapEntityLink(row: GoogleDriveEntityLinkRow, entityLabel?: string): GoogleDriveEntityLink {
  const entity = entityIdentity(row);
  return {
    id: row.id,
    broker: row.broker,
    rootId: row.root_id,
    folderId: row.folder_id,
    folderName: row.folder_name,
    webViewLink: row.web_view_link,
    ...entity,
    entityLabel: entityLabel || ({ contact: "Contact", listing: "Listing", transaction: "Transaction" }[entity.entityType]),
    createdAt: row.created_at,
  };
}

function entityKey(entityType: GoogleDriveEntityType, entityId: string) {
  return `${entityType}:${entityId}`;
}

function chunks<T>(values: T[], size = 100) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function loadEntityLabels(rows: GoogleDriveEntityLinkRow[]) {
  const labels = new Map<string, string>();
  const ids = {
    contact: [...new Set(rows.flatMap((row) => row.contact_id ? [row.contact_id] : []))],
    listing: [...new Set(rows.flatMap((row) => row.listing_id ? [row.listing_id] : []))],
    transaction: [...new Set(rows.flatMap((row) => row.transaction_id ? [row.transaction_id] : []))],
  };
  const admin = getSupabaseAdmin();
  await Promise.all([
    mapWithConcurrency(chunks(ids.contact), 3, async (batch) => {
      const { data, error } = await admin.from("contacts").select("id, first_name, last_name").in("id", batch);
      if (error) throw error;
      for (const row of data ?? []) {
        const label = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Contact";
        labels.set(entityKey("contact", row.id), label);
      }
    }),
    mapWithConcurrency(chunks(ids.listing), 3, async (batch) => {
      const { data, error } = await admin.from("listings").select("id, civic_number, address, apartment, city").in("id", batch);
      if (error) throw error;
      for (const row of data ?? []) {
        const street = [row.civic_number, row.address].filter(Boolean).join(" ").trim();
        const label = [street, row.apartment ? `app. ${row.apartment}` : "", row.city].filter(Boolean).join(", ") || "Listing";
        labels.set(entityKey("listing", row.id), label);
      }
    }),
    mapWithConcurrency(chunks(ids.transaction), 3, async (batch) => {
      const { data, error } = await admin.from("transactions").select("id, address").in("id", batch);
      if (error) throw error;
      for (const row of data ?? []) labels.set(entityKey("transaction", row.id), row.address?.trim() || "Transaction");
    }),
  ]);
  return labels;
}

async function getDriveEntity(entityType: GoogleDriveEntityType, entityId: string) {
  const admin = getSupabaseAdmin();
  if (entityType === "contact") {
    const { data, error } = await admin.from("contacts").select("id, broker, first_name, last_name").eq("id", entityId).maybeSingle();
    if (error) throw error;
    if (!data) throw new GoogleDriveEntityNotFoundError();
    if (!isCalendarBroker(data.broker)) throw new GoogleDriveEntityUnassignedError();
    return { broker: data.broker, label: [data.first_name, data.last_name].filter(Boolean).join(" ").trim() || "Contact" };
  }
  if (entityType === "listing") {
    const { data, error } = await admin.from("listings").select("id, broker, civic_number, address, apartment, city").eq("id", entityId).maybeSingle();
    if (error) throw error;
    if (!data) throw new GoogleDriveEntityNotFoundError();
    if (!isCalendarBroker(data.broker)) throw new GoogleDriveEntityUnassignedError();
    const street = [data.civic_number, data.address].filter(Boolean).join(" ").trim();
    return { broker: data.broker, label: [street, data.apartment ? `app. ${data.apartment}` : "", data.city].filter(Boolean).join(", ") || "Listing" };
  }
  const { data, error } = await admin.from("transactions").select("id, broker, address").eq("id", entityId).maybeSingle();
  if (error) throw error;
  if (!data) throw new GoogleDriveEntityNotFoundError();
  if (!isCalendarBroker(data.broker)) throw new GoogleDriveEntityUnassignedError();
  return { broker: data.broker, label: data.address?.trim() || "Transaction" };
}

export async function listGoogleDriveEntityLinks(filters: {
  broker?: CalendarBroker;
  entityType?: GoogleDriveEntityType;
  entityId?: string;
}) {
  const rows = await listAllSupabaseRows<GoogleDriveEntityLinkRow>({
    buildQuery: () => {
      let query = getSupabaseAdmin().from("google_drive_entity_links").select(entityLinkColumns);
      if (filters.broker) query = query.eq("broker", filters.broker);
      if (filters.entityType && filters.entityId) query = query.eq(entityColumn[filters.entityType], filters.entityId);
      return query as unknown as SupabaseOrderedRangeQuery<GoogleDriveEntityLinkRow>;
    },
    orders: [{ column: "created_at", ascending: true }, { column: "id", ascending: true }],
  });
  const labels = await loadEntityLabels(rows);
  return rows.map((row) => {
    const entity = entityIdentity(row);
    return mapEntityLink(row, labels.get(entityKey(entity.entityType, entity.entityId)));
  });
}

export async function addGoogleDriveEntityLink(input: {
  entityType: GoogleDriveEntityType;
  entityId: string;
  rootId: string;
  folderId: string;
}) {
  const entity = await getDriveEntity(input.entityType, input.entityId);
  const authorized = await getAuthorizedGoogleDriveFolder(entity.broker, input.rootId, input.folderId);
  const column = entityColumn[input.entityType];
  const admin = getSupabaseAdmin();
  const findExisting = () => admin.from("google_drive_entity_links")
    .select(entityLinkColumns)
    .eq("root_id", input.rootId)
    .eq("folder_id", input.folderId)
    .eq(column, input.entityId)
    .maybeSingle();
  const existing = await findExisting();
  if (existing.error) throw existing.error;
  if (existing.data) return mapEntityLink(existing.data as GoogleDriveEntityLinkRow, entity.label);

  const values = {
    broker: entity.broker,
    root_id: authorized.root.id,
    folder_id: authorized.folder.id,
    folder_name: authorized.folder.name,
    web_view_link: authorized.folder.webViewLink,
    contact_id: null,
    listing_id: null,
    transaction_id: null,
    [column]: input.entityId,
  };
  const { data, error } = await admin.from("google_drive_entity_links").insert(values).select(entityLinkColumns).single();
  if (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "23505") {
      const retry = await findExisting();
      if (retry.error) throw retry.error;
      if (retry.data) return mapEntityLink(retry.data as GoogleDriveEntityLinkRow, entity.label);
    }
    throw error;
  }
  return mapEntityLink(data as GoogleDriveEntityLinkRow, entity.label);
}

export async function removeGoogleDriveEntityLink(linkId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("google_drive_entity_links")
    .delete()
    .eq("id", linkId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
