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

const rootColumns = "id, broker, folder_id, folder_name, drive_id, web_view_link, created_at, updated_at";
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

export async function getAuthorizedGoogleDriveFolder(
  broker: CalendarBroker,
  rootId: string,
  folderId: string,
) {
  const [connection, root] = await Promise.all([
    requireDriveConnection(broker),
    getGoogleDriveRoot(broker, rootId),
  ]);
  const resolved = await resolveAuthorizedFolder(connection, root, folderId);
  return { root, folder: resolved.folder, breadcrumbs: resolved.breadcrumbs };
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
