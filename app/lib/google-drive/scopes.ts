export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export function hasGoogleDriveFileScope(scopes: ReadonlyArray<string> | null | undefined) {
  return scopes?.includes(GOOGLE_DRIVE_FILE_SCOPE) ?? false;
}
