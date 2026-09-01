import type { CalendarBroker } from "./calendar-types";

export const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export type GoogleDriveItem = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  size: string | null;
  webViewLink: string | null;
  iconLink: string | null;
  thumbnailLink: string | null;
  driveId: string | null;
  isFolder: boolean;
};

export type GoogleDriveBreadcrumb = Pick<GoogleDriveItem, "id" | "name">;

export type GoogleDriveFolderListing = {
  root: GoogleDriveRoot;
  folder: GoogleDriveItem;
  breadcrumbs: GoogleDriveBreadcrumb[];
  items: GoogleDriveItem[];
};

export type GoogleDriveSearchResult = GoogleDriveItem & {
  rootId: string;
  rootName: string;
  breadcrumbs: GoogleDriveBreadcrumb[];
};

export const GOOGLE_DRIVE_ENTITY_TYPES = ["contact", "listing", "transaction"] as const;
export type GoogleDriveEntityType = (typeof GOOGLE_DRIVE_ENTITY_TYPES)[number];

export type GoogleDriveEntityLink = {
  id: string;
  broker: CalendarBroker;
  rootId: string;
  folderId: string;
  folderName: string;
  webViewLink: string | null;
  entityType: GoogleDriveEntityType;
  entityId: string;
  entityLabel: string;
  createdAt: string;
};

export type GoogleDriveEntityLinkRow = {
  id: string;
  broker: CalendarBroker;
  root_id: string;
  folder_id: string;
  folder_name: string;
  web_view_link: string | null;
  contact_id: string | null;
  listing_id: string | null;
  transaction_id: string | null;
  created_at: string;
};

export type GoogleDriveRoot = {
  id: string;
  broker: CalendarBroker;
  folderId: string;
  folderName: string;
  driveId: string | null;
  webViewLink: string | null;
  googlePermissionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GoogleDriveRootRow = {
  id: string;
  broker: CalendarBroker;
  folder_id: string;
  folder_name: string;
  drive_id: string | null;
  web_view_link: string | null;
  google_permission_id: string | null;
  created_at: string;
  updated_at: string;
};

export function mapGoogleDriveRootRow(row: GoogleDriveRootRow): GoogleDriveRoot {
  return {
    id: row.id,
    broker: row.broker,
    folderId: row.folder_id,
    folderName: row.folder_name,
    driveId: row.drive_id,
    webViewLink: row.web_view_link,
    googlePermissionId: row.google_permission_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function isGoogleDriveRootId(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isGoogleDriveFolderId(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 5
    && value.length <= 200
    && /^[A-Za-z0-9_-]+$/.test(value);
}

export function isGoogleDriveEntityType(value: unknown): value is GoogleDriveEntityType {
  return typeof value === "string" && GOOGLE_DRIVE_ENTITY_TYPES.includes(value as GoogleDriveEntityType);
}

export function isGoogleDriveEntityId(value: unknown): value is string {
  return isGoogleDriveRootId(value);
}
