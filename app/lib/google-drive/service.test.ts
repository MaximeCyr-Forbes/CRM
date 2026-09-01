import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleDriveRootRow } from "../../data/google-drive-types";
import { GOOGLE_DRIVE_FILE_SCOPE } from "./scopes";

const rootId = "11111111-1111-4111-8111-111111111111";
const state = vi.hoisted(() => ({
  scopes: ["openid", "email", "https://www.googleapis.com/auth/drive.file"],
  roots: [] as GoogleDriveRootRow[],
  userRequests: [] as Array<{ url: URL; init: RequestInit }>,
  serviceRequests: [] as Array<{ url: URL; init: RequestInit }>,
  permissionDeleteStatus: 204,
  existingPermissionId: null as string | null,
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
  googleAuthenticatedRequest: vi.fn(async (_connection: unknown, rawUrl: string, init: RequestInit) => {
    const url = new URL(rawUrl);
    state.userRequests.push({ url, init });
    if ((init.method ?? "GET") === "POST") return Response.json({ id: "permission_reader_1" });
    if ((init.method ?? "GET") === "DELETE") return new Response(null, { status: state.permissionDeleteStatus });
    if (url.pathname.endsWith("/permissions")) {
      return Response.json({
        permissions: state.existingPermissionId ? [{
          id: state.existingPermissionId,
          type: "user",
          role: "reader",
          emailAddress: "drive-reader@example.iam.gserviceaccount.com",
        }] : [],
      });
    }
    return Response.json({
      id: "folder_12345",
      name: "Dossiers clients",
      mimeType: "application/vnd.google-apps.folder",
      driveId: "shared-drive-1",
      webViewLink: "https://drive.google.com/drive/folders/folder_12345",
    });
  }),
}));

vi.mock("./service-account", () => ({
  getGoogleDriveServiceAccountEmail: vi.fn(() => "drive-reader@example.iam.gserviceaccount.com"),
  serviceAccountGoogleDriveRequest: vi.fn(async (rawUrl: string, init: RequestInit) => {
    const url = new URL(rawUrl);
    state.serviceRequests.push({ url, init });
    return Response.json({
      id: "folder_12345",
      name: "Dossiers clients",
      mimeType: "application/vnd.google-apps.folder",
      driveId: "shared-drive-1",
      webViewLink: "https://drive.google.com/drive/folders/folder_12345",
    });
  }),
  GoogleDriveServiceAccountConfigurationError: class GoogleDriveServiceAccountConfigurationError extends Error {},
}));

vi.mock("../supabase/server", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => {
      const filters = new Map<string, unknown>();
      let operation: "select" | "upsert" | "delete" = "select";
      let values: Record<string, unknown> | null = null;
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          filters.set(column, value);
          return builder;
        }),
        upsert: vi.fn((input: Record<string, unknown>) => {
          operation = "upsert";
          values = input;
          return builder;
        }),
        delete: vi.fn(() => {
          operation = "delete";
          return builder;
        }),
        maybeSingle: vi.fn(async () => {
          const matching = state.roots.find((root) => (
            (!filters.has("id") || root.id === filters.get("id"))
            && (!filters.has("broker") || root.broker === filters.get("broker"))
            && (!filters.has("folder_id") || root.folder_id === filters.get("folder_id"))
          )) ?? null;
          if (operation === "delete" && matching) {
            state.roots = state.roots.filter((root) => root.id !== matching.id);
            return { data: { id: matching.id }, error: null };
          }
          return { data: matching, error: null };
        }),
        single: vi.fn(async () => {
          if (operation !== "upsert" || !values) return { data: null, error: new Error("upsert attendu") };
          const existing = state.roots.find((root) => root.broker === values!.broker && root.folder_id === values!.folder_id);
          const row: GoogleDriveRootRow = {
            id: existing?.id ?? rootId,
            broker: values.broker as "maxime",
            folder_id: values.folder_id as string,
            folder_name: values.folder_name as string,
            drive_id: values.drive_id as string | null,
            web_view_link: values.web_view_link as string | null,
            google_permission_id: values.google_permission_id as string | null,
            created_at: existing?.created_at ?? "2026-09-01T12:00:00.000Z",
            updated_at: "2026-09-01T12:00:00.000Z",
          };
          state.roots = [...state.roots.filter((root) => root.id !== row.id), row];
          return { data: row, error: null };
        }),
      };
      return builder;
    }),
  })),
}));

import {
  addGoogleDriveRoot,
  getGoogleDriveFolderMetadata,
  GoogleDriveAuthorizationRequiredError,
  GoogleDriveFolderRequiredError,
  GoogleDrivePermissionRevocationError,
  removeGoogleDriveRoot,
} from "./service";

describe("autorisations Google Drive par racine", () => {
  beforeEach(() => {
    state.scopes = ["openid", "email", GOOGLE_DRIVE_FILE_SCOPE];
    state.roots = [];
    state.userRequests = [];
    state.serviceRequests = [];
    state.permissionDeleteStatus = 204;
    state.existingPermissionId = null;
  });

  it("lit les métadonnées du dossier choisi avec le jeton drive.file", async () => {
    await expect(getGoogleDriveFolderMetadata("maxime", "folder_12345")).resolves.toMatchObject({
      id: "folder_12345", name: "Dossiers clients", driveId: "shared-drive-1",
    });
    expect(state.userRequests).toHaveLength(1);
    expect(state.userRequests[0].init.method).toBe("GET");
  });

  it("crée une permission reader pour le service account puis sauvegarde son id", async () => {
    const root = await addGoogleDriveRoot("maxime", "folder_12345");
    expect(root.googlePermissionId).toBe("permission_reader_1");
    const permissionRequest = state.userRequests.find((request) => request.init.method === "POST");
    expect(permissionRequest).toBeDefined();
    expect(permissionRequest!.url.pathname).toContain("/folder_12345/permissions");
    expect(permissionRequest!.url.searchParams.get("supportsAllDrives")).toBe("true");
    expect(permissionRequest!.url.searchParams.get("sendNotificationEmail")).toBe("false");
    expect(JSON.parse(String(permissionRequest!.init.body))).toEqual({
      type: "user", role: "reader", emailAddress: "drive-reader@example.iam.gserviceaccount.com",
    });
    expect(state.serviceRequests).toHaveLength(1);
    expect(state.serviceRequests[0].init.method).toBe("GET");
  });

  it("récupère l’id d’une permission reader existante pour une racine historique", async () => {
    state.roots = [{
      id: rootId,
      broker: "maxime",
      folder_id: "folder_12345",
      folder_name: "Dossiers clients",
      drive_id: "shared-drive-1",
      web_view_link: "https://drive.google.com/drive/folders/folder_12345",
      google_permission_id: null,
      created_at: "2026-09-01T12:00:00.000Z",
      updated_at: "2026-09-01T12:00:00.000Z",
    }];
    state.existingPermissionId = "legacy_permission_reader";

    const root = await addGoogleDriveRoot("maxime", "folder_12345");

    expect(root.googlePermissionId).toBe("legacy_permission_reader");
    expect(state.userRequests.some((request) => request.init.method === "POST")).toBe(false);
    expect(state.userRequests.some((request) => request.url.pathname.endsWith("/permissions"))).toBe(true);
  });

  it("révoque la permission Google avant de supprimer la racine Supabase", async () => {
    await addGoogleDriveRoot("maxime", "folder_12345");
    await expect(removeGoogleDriveRoot("maxime", rootId)).resolves.toBe(true);
    const revoke = state.userRequests.find((request) => request.init.method === "DELETE");
    expect(revoke?.url.pathname).toContain("/folder_12345/permissions/permission_reader_1");
    expect(state.roots).toHaveLength(0);
  });

  it("conserve la racine Supabase si la révocation Google échoue", async () => {
    await addGoogleDriveRoot("maxime", "folder_12345");
    state.permissionDeleteStatus = 403;
    await expect(removeGoogleDriveRoot("maxime", rootId))
      .rejects.toBeInstanceOf(GoogleDrivePermissionRevocationError);
    expect(state.roots).toHaveLength(1);
  });

  it("refuse un fichier qui n’est pas un dossier", async () => {
    const connectionModule = await import("../google/connection");
    vi.mocked(connectionModule.googleAuthenticatedRequest).mockResolvedValueOnce(Response.json({
      id: "file_12345", name: "Contrat.pdf", mimeType: "application/pdf",
    }));
    await expect(getGoogleDriveFolderMetadata("maxime", "file_12345"))
      .rejects.toBeInstanceOf(GoogleDriveFolderRequiredError);
  });

  it("refuse une connexion sans le scope drive.file", async () => {
    state.scopes = ["openid", "email"];
    await expect(getGoogleDriveFolderMetadata("maxime", "folder_12345"))
      .rejects.toBeInstanceOf(GoogleDriveAuthorizationRequiredError);
    expect(state.userRequests).toHaveLength(0);
  });
});
