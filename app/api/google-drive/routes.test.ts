import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleDriveRoot } from "../../data/google-drive-types";

const rootId = "11111111-1111-4111-8111-111111111111";
const state = vi.hoisted(() => ({
  accessDenied: false,
  sameOrigin: true,
  token: "short-lived-access-token",
  roots: [] as GoogleDriveRoot[],
  addError: null as "authorization" | "folder" | null,
  removeResult: true,
  removed: [] as Array<{ broker: string; rootId: string }>,
}));

vi.mock("../../lib/crm-access", () => ({
  requireApiAccess: vi.fn(async () => ({
    response: state.accessDenied
      ? Response.json({ error: "Accès CRM requis." }, { status: 401 })
      : null,
  })),
}));

vi.mock("../../lib/google-calendar/config", () => ({
  isSameOriginRequest: vi.fn(() => state.sameOrigin),
}));

vi.mock("../../lib/google-drive/service", () => {
  class GoogleDriveAuthorizationRequiredError extends Error {
    constructor() { super("L’autorisation Google Drive est requise pour ce courtier."); }
  }
  class GoogleDriveFolderRequiredError extends Error {
    constructor() { super("L’élément sélectionné doit être un dossier Google Drive."); }
  }
  return {
    GoogleDriveAuthorizationRequiredError,
    GoogleDriveFolderRequiredError,
    getGoogleDrivePickerAccessToken: vi.fn(async () => state.token),
    listGoogleDriveRoots: vi.fn(async () => state.roots),
    addGoogleDriveRoot: vi.fn(async (broker: GoogleDriveRoot["broker"], folderId: string) => {
      if (state.addError === "authorization") throw new GoogleDriveAuthorizationRequiredError();
      if (state.addError === "folder") throw new GoogleDriveFolderRequiredError();
      const existing = state.roots.find((root) => root.broker === broker && root.folderId === folderId);
      if (existing) return existing;
      const root: GoogleDriveRoot = {
        id: rootId,
        broker,
        folderId,
        folderName: "Dossiers clients",
        driveId: "shared-drive-1",
        webViewLink: "https://drive.google.com/drive/folders/folder_12345",
        createdAt: "2026-09-01T12:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
      };
      state.roots.push(root);
      return root;
    }),
    removeGoogleDriveRoot: vi.fn(async (broker: string, id: string) => {
      state.removed.push({ broker, rootId: id });
      return state.removeResult;
    }),
  };
});

import { GET as pickerToken } from "./picker-token/route";
import { GET as listRoots, POST as addRoot } from "./roots/route";
import { DELETE as removeRoot } from "./roots/[rootId]/route";

function postRoot(body: unknown) {
  return addRoot(new Request("https://crm.example.com/api/google-drive/roots", {
    method: "POST",
    headers: { Origin: "https://crm.example.com", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("routes Google Drive", () => {
  beforeEach(() => {
    state.accessDenied = false;
    state.sameOrigin = true;
    state.token = "short-lived-access-token";
    state.roots = [];
    state.addError = null;
    state.removeResult = true;
    state.removed = [];
  });

  it("protège toutes les routes par la session CRM", async () => {
    state.accessDenied = true;
    expect((await pickerToken(new Request("https://crm.example.com/api/google-drive/picker-token?broker=maxime"))).status).toBe(401);
    expect((await listRoots(new Request("https://crm.example.com/api/google-drive/roots?broker=maxime"))).status).toBe(401);
    expect((await postRoot({ broker: "maxime", folderId: "folder_12345" })).status).toBe(401);
  });

  it("retourne uniquement le jeton d’accès court terme au Picker", async () => {
    const response = await pickerToken(new Request("https://crm.example.com/api/google-drive/picker-token?broker=maxime"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accessToken: "short-lived-access-token" });
  });

  it("valide le courtier et l’origine avant une écriture", async () => {
    expect((await pickerToken(new Request("https://crm.example.com/api/google-drive/picker-token?broker=unassigned"))).status).toBe(400);
    state.sameOrigin = false;
    expect((await postRoot({ broker: "maxime", folderId: "folder_12345" })).status).toBe(403);
  });

  it("ajoute et déduplique un dossier partagé ou Shared Drive", async () => {
    const first = await postRoot({ broker: "maxime", folderId: "folder_12345" });
    const second = await postRoot({ broker: "maxime", folderId: "folder_12345" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(state.roots).toHaveLength(1);
    expect((await first.json()).root).toMatchObject({ driveId: "shared-drive-1" });
  });

  it("refuse un fichier sélectionné comme racine", async () => {
    state.addError = "folder";
    const response = await postRoot({ broker: "maxime", folderId: "file_12345" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "L’élément sélectionné doit être un dossier Google Drive." });
  });

  it("retire uniquement la liaison CRM du courtier", async () => {
    const response = await removeRoot(
      new Request(`https://crm.example.com/api/google-drive/roots/${rootId}?broker=maxime`, {
        method: "DELETE",
        headers: { Origin: "https://crm.example.com" },
      }),
      { params: Promise.resolve({ rootId }) },
    );
    expect(response.status).toBe(200);
    expect(state.removed).toEqual([{ broker: "maxime", rootId }]);
  });
});
