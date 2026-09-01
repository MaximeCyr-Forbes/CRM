import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_DRIVE_FILE_SCOPE } from "./scopes";

const state = vi.hoisted(() => ({
  scopes: ["openid", "email", "https://www.googleapis.com/auth/drive.file"],
  response: new Response(),
  requests: [] as Array<{ url: string; init: RequestInit }>,
}));

vi.mock("../google/connection", () => ({
  getGoogleConnection: vi.fn(async () => ({
    broker: "maxime",
    google_account_email: "maxime@example.com",
    calendar_id: "primary",
    encrypted_access_token: "encrypted",
    encrypted_refresh_token: "encrypted-refresh",
    access_token_expires_at: "2026-09-01T15:00:00.000Z",
    scopes: state.scopes,
  })),
  getGoogleAccessToken: vi.fn(async () => "token"),
  googleAuthenticatedRequest: vi.fn(async (_connection: unknown, url: string, init: RequestInit) => {
    state.requests.push({ url, init });
    return state.response;
  }),
}));

vi.mock("../supabase/server", () => ({ getSupabaseAdmin: vi.fn() }));

import {
  getGoogleDriveFolderMetadata,
  GoogleDriveAuthorizationRequiredError,
  GoogleDriveFolderRequiredError,
} from "./service";

describe("service Google Drive en lecture seule", () => {
  beforeEach(() => {
    state.scopes = ["openid", "email", GOOGLE_DRIVE_FILE_SCOPE];
    state.requests = [];
    state.response = Response.json({
      id: "folder_12345",
      name: "Dossiers clients",
      mimeType: "application/vnd.google-apps.folder",
      driveId: "shared-drive-1",
      webViewLink: "https://drive.google.com/drive/folders/folder_12345",
    });
  });

  it("lit les métadonnées du dossier avec supportsAllDrives sans écriture Drive", async () => {
    await expect(getGoogleDriveFolderMetadata("maxime", "folder_12345")).resolves.toEqual({
      id: "folder_12345",
      name: "Dossiers clients",
      driveId: "shared-drive-1",
      webViewLink: "https://drive.google.com/drive/folders/folder_12345",
    });
    expect(state.requests).toHaveLength(1);
    const request = state.requests[0];
    const url = new URL(request.url);
    expect(url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(url.searchParams.get("fields")).toBe("id,name,mimeType,driveId,webViewLink");
    expect(request.init.method).toBe("GET");
  });

  it("refuse un fichier qui n’est pas un dossier", async () => {
    state.response = Response.json({ id: "file_12345", name: "Contrat.pdf", mimeType: "application/pdf" });
    await expect(getGoogleDriveFolderMetadata("maxime", "file_12345"))
      .rejects.toBeInstanceOf(GoogleDriveFolderRequiredError);
  });

  it("refuse une connexion sans le scope drive.file", async () => {
    state.scopes = ["openid", "email"];
    await expect(getGoogleDriveFolderMetadata("maxime", "folder_12345"))
      .rejects.toBeInstanceOf(GoogleDriveAuthorizationRequiredError);
    expect(state.requests).toHaveLength(0);
  });
});
