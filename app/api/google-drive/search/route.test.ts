import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ accessDenied: false, receivedQuery: "" }));

vi.mock("../../../lib/crm-access", () => ({
  requireApiAccess: vi.fn(async () => ({
    response: state.accessDenied ? Response.json({ error: "Accès CRM requis." }, { status: 401 }) : null,
  })),
}));

vi.mock("../../../lib/google-drive/service", () => {
  class GoogleDriveAuthorizationRequiredError extends Error {}
  return {
    GoogleDriveAuthorizationRequiredError,
    searchAuthorizedGoogleDrive: vi.fn(async (_broker: string, query: string) => {
      state.receivedQuery = query;
      return { results: [], truncated: false, unavailableRootIds: [] };
    }),
  };
});

import { GET } from "./route";

describe("route de recherche Google Drive", () => {
  beforeEach(() => {
    state.accessDenied = false;
    state.receivedQuery = "";
  });

  it("exige une session et un courtier valide", async () => {
    state.accessDenied = true;
    expect((await GET(new Request("https://crm.example.com/api/google-drive/search?broker=maxime&q=PA"))).status).toBe(401);
    state.accessDenied = false;
    expect((await GET(new Request("https://crm.example.com/api/google-drive/search?broker=unassigned&q=PA"))).status).toBe(400);
  });

  it("valide puis transmet la recherche au service sécurisé", async () => {
    expect((await GET(new Request("https://crm.example.com/api/google-drive/search?broker=maxime&q="))).status).toBe(400);
    const response = await GET(new Request("https://crm.example.com/api/google-drive/search?broker=maxime&q=Archambault"));
    expect(response.status).toBe(200);
    expect(state.receivedQuery).toBe("Archambault");
  });
});
