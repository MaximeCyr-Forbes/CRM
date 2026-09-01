import { beforeEach, describe, expect, it, vi } from "vitest";

const linkId = "55555555-5555-4555-8555-555555555555";
const state = vi.hoisted(() => ({ accessDenied: false, sameOrigin: true, exists: true }));

vi.mock("../../../../lib/crm-access", () => ({ requireApiAccess: vi.fn(async () => ({ response: state.accessDenied ? new Response(null, { status: 401 }) : null })) }));
vi.mock("../../../../lib/google-calendar/config", () => ({ isSameOriginRequest: vi.fn(() => state.sameOrigin) }));
vi.mock("../../../../lib/google-drive/service", () => ({ removeGoogleDriveEntityLink: vi.fn(async () => state.exists) }));

import { DELETE } from "./route";

describe("retrait d’un lien Drive", () => {
  beforeEach(() => { state.accessDenied = false; state.sameOrigin = true; state.exists = true; });

  it("retire seulement le lien CRM", async () => {
    const response = await DELETE(new Request(`https://crm.example.com/api/google-drive/entity-links/${linkId}`, { method: "DELETE" }), { params: Promise.resolve({ linkId }) });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ linkId });
  });

  it("protège la session, l’origine et les identifiants", async () => {
    state.accessDenied = true;
    expect((await DELETE(new Request("https://crm.example.com"), { params: Promise.resolve({ linkId }) })).status).toBe(401);
    state.accessDenied = false; state.sameOrigin = false;
    expect((await DELETE(new Request("https://crm.example.com"), { params: Promise.resolve({ linkId }) })).status).toBe(403);
    state.sameOrigin = true;
    expect((await DELETE(new Request("https://crm.example.com"), { params: Promise.resolve({ linkId: "bad" }) })).status).toBe(400);
  });
});
