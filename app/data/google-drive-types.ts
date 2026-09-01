import type { CalendarBroker } from "./calendar-types";

export const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export type GoogleDriveRoot = {
  id: string;
  broker: CalendarBroker;
  folderId: string;
  folderName: string;
  driveId: string | null;
  webViewLink: string | null;
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
