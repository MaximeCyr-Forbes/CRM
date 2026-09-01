import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  contact: "11111111-1111-4111-8111-111111111111",
  listing: "22222222-2222-4222-8222-222222222222",
  transaction: "33333333-3333-4333-8333-333333333333",
  root: "44444444-4444-4444-8444-444444444444",
};
const state = vi.hoisted(() => ({ accessDenied: false, sameOrigin: true, failure: "" }));

vi.mock("../../../lib/crm-access", () => ({
  requireApiAccess: vi.fn(async () => ({ response: state.accessDenied ? Response.json({ error: "Accès requis." }, { status: 401 }) : null })),
}));
vi.mock("../../../lib/google-calendar/config", () => ({ isSameOriginRequest: vi.fn(() => state.sameOrigin) }));
vi.mock("../../../lib/google-drive/service", () => {
  class GoogleDriveAccessDeniedError extends Error {}
  class GoogleDriveAuthorizationRequiredError extends Error {}
  class GoogleDriveEntityNotFoundError extends Error {}
  class GoogleDriveEntityUnassignedError extends Error {}
  class GoogleDriveFolderRequiredError extends Error {}
  class GoogleDriveItemUnavailableError extends Error {}
  class GoogleDriveRootNotFoundError extends Error {}
  return {
    GoogleDriveAccessDeniedError,
    GoogleDriveAuthorizationRequiredError,
    GoogleDriveEntityNotFoundError,
    GoogleDriveEntityUnassignedError,
    GoogleDriveFolderRequiredError,
    GoogleDriveItemUnavailableError,
    GoogleDriveRootNotFoundError,
    listGoogleDriveEntityLinks: vi.fn(async (filters: { entityType?: string; entityId?: string; broker?: string }) => [filters]),
    addGoogleDriveEntityLink: vi.fn(async (input: { entityType: string; entityId: string; rootId: string; folderId: string }) => {
      if (state.failure === "outside") throw new GoogleDriveAccessDeniedError("Hors racine");
      if (state.failure === "unassigned") throw new GoogleDriveEntityUnassignedError("Courtier requis");
      return { id: "55555555-5555-4555-8555-555555555555", ...input };
    }),
  };
});

import { GET, POST } from "./route";

describe("API des liens Google Drive", () => {
  beforeEach(() => { state.accessDenied = false; state.sameOrigin = true; state.failure = ""; });

  it.each(["contact", "listing", "transaction"])("charge les liens d’un %s", async (entityType) => {
    const response = await GET(new Request(`https://crm.example.com/api/google-drive/entity-links?entityType=${entityType}&entityId=${ids[entityType as keyof typeof ids]}`));
    expect(response.status).toBe(200);
    expect((await response.json()).links[0]).toMatchObject({ entityType });
  });

  it("charge tous les liens d’un courtier pour les annotations Drive", async () => {
    const response = await GET(new Request("https://crm.example.com/api/google-drive/entity-links?broker=maxime"));
    expect(response.status).toBe(200);
    expect((await response.json()).links[0]).toEqual({ broker: "maxime" });
  });

  it.each(["contact", "listing", "transaction"])("lie un dossier autorisé à un %s", async (entityType) => {
    const response = await POST(new Request("https://crm.example.com/api/google-drive/entity-links", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://crm.example.com" },
      body: JSON.stringify({ entityType, entityId: ids[entityType as keyof typeof ids], rootId: ids.root, folderId: "folder_child" }),
    }));
    expect(response.status).toBe(201);
    expect((await response.json()).link).toMatchObject({ entityType, folderId: "folder_child" });
  });

  it("refuse l’origine externe, le dossier hors racine et le Contact non attribué", async () => {
    state.sameOrigin = false;
    expect((await POST(new Request("https://crm.example.com/api/google-drive/entity-links", { method: "POST" }))).status).toBe(403);
    state.sameOrigin = true;
    const request = () => new Request("https://crm.example.com/api/google-drive/entity-links", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType: "contact", entityId: ids.contact, rootId: ids.root, folderId: "folder_child" }),
    });
    state.failure = "outside";
    expect((await POST(request())).status).toBe(403);
    state.failure = "unassigned";
    expect((await POST(request())).status).toBe(409);
  });
});
