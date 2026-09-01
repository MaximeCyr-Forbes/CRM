import { beforeEach, describe, expect, it, vi } from "vitest";

const rootId = "11111111-1111-4111-8111-111111111111";
const state = vi.hoisted(() => ({ accessDenied: false, failure: null as "outside" | "missing" | "authorization" | null }));

vi.mock("../../../lib/crm-access", () => ({
  requireApiAccess: vi.fn(async () => ({
    response: state.accessDenied ? Response.json({ error: "Accès CRM requis." }, { status: 401 }) : null,
  })),
}));

vi.mock("../../../lib/google-drive/service", () => {
  class GoogleDriveAuthorizationRequiredError extends Error {}
  class GoogleDriveFolderRequiredError extends Error {}
  class GoogleDriveRootNotFoundError extends Error {}
  class GoogleDriveAccessDeniedError extends Error {}
  class GoogleDriveItemUnavailableError extends Error {}
  return {
    GoogleDriveAuthorizationRequiredError,
    GoogleDriveFolderRequiredError,
    GoogleDriveRootNotFoundError,
    GoogleDriveAccessDeniedError,
    GoogleDriveItemUnavailableError,
    listAuthorizedGoogleDriveFolder: vi.fn(async (_broker: string, _rootId: string, folderId?: string) => {
      if (state.failure === "outside") throw new GoogleDriveAccessDeniedError("Hors racine");
      if (state.failure === "missing") throw new GoogleDriveItemUnavailableError("Inaccessible");
      if (state.failure === "authorization") throw new GoogleDriveAuthorizationRequiredError("Autorisation requise");
      return {
        root: { id: rootId, folderId: "root_folder" },
        folder: { id: folderId ?? "root_folder", name: "Transactions" },
        breadcrumbs: [{ id: "root_folder", name: "Transactions" }],
        items: [],
      };
    }),
  };
});

import { GET } from "./route";

function browse(folderId?: string) {
  const query = new URLSearchParams({ broker: "maxime", rootId });
  if (folderId) query.set("folderId", folderId);
  return GET(new Request(`https://crm.example.com/api/google-drive/browse?${query.toString()}`));
}

describe("route de navigation Google Drive", () => {
  beforeEach(() => {
    state.accessDenied = false;
    state.failure = null;
  });

  it("exige la session CRM", async () => {
    state.accessDenied = true;
    expect((await browse()).status).toBe(401);
  });

  it("retourne une navigation autorisée", async () => {
    const response = await browse("child_folder");
    expect(response.status).toBe(200);
    expect((await response.json()).data.folder.id).toBe("child_folder");
  });

  it("retourne 403 pour un folderId hors de la racine", async () => {
    state.failure = "outside";
    expect((await browse("outside_folder")).status).toBe(403);
  });

  it("distingue le dossier inaccessible et l’autorisation expirée", async () => {
    state.failure = "missing";
    expect((await browse("missing_folder")).status).toBe(404);
    state.failure = "authorization";
    expect((await browse()).status).toBe(409);
  });
});
