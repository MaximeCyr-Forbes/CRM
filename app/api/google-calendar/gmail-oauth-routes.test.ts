import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  connections: [] as Array<{ broker: "france" | "maxime" | "sandrine"; connected: boolean; gmailSendEnabled: boolean; gmailSignatureEnabled: boolean }>,
  exchange: vi.fn(),
  save: vi.fn(),
  verified: { broker: "maxime" as const, capability: "gmail" as const, returnTo: "/contacts/11111111-1111-4111-8111-111111111111" },
}));

vi.mock("../../lib/crm-access", () => ({ requireApiAccess: vi.fn(async () => ({ response: null })) }));
vi.mock("../../lib/google-calendar/config", () => ({
  getApplicationOrigin: () => "https://crm.example.com",
  getGoogleOAuthConfig: () => ({ clientId: "client-id", clientSecret: "client-secret", stateSecret: "state-secret" }),
  getGoogleRedirectUri: () => "https://crm.example.com/api/google-calendar/callback",
}));
vi.mock("../../lib/google-calendar/oauth-state", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/google-calendar/oauth-state")>();
  return { ...original, createOAuthState: vi.fn(async () => "signed-state"), verifyOAuthState: vi.fn(async () => state.verified) };
});
vi.mock("../../lib/google-calendar/service", () => ({
  listGoogleConnectionStatuses: vi.fn(async () => state.connections),
  exchangeGoogleAuthorizationCode: state.exchange,
  saveGoogleConnection: state.save,
}));

import { GET as connect } from "./connect/route";
import { GET as callback } from "./callback/route";

describe("routes OAuth Gmail", () => {
  beforeEach(() => {
    state.connections = [];
    state.exchange.mockReset().mockResolvedValue({ access_token: "access", expires_in: 3600, scope: "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.settings.basic" });
    state.save.mockReset().mockResolvedValue(undefined);
    state.verified = { broker: "maxime", capability: "gmail", returnTo: "/contacts/11111111-1111-4111-8111-111111111111" };
  });

  it("relance OAuth si Agenda est connecté mais gmail.send absent", async () => {
    state.connections = [{ broker: "maxime", connected: true, gmailSendEnabled: false, gmailSignatureEnabled: false }];
    const response = await connect(new Request("https://crm.example.com/api/google-calendar/connect?broker=maxime&capability=gmail&returnTo=/contacts/11111111-1111-4111-8111-111111111111"));
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("scope")?.split(" ")).toEqual(expect.arrayContaining(["openid", "email", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.settings.basic"]));
  });

  it("relance OAuth si gmail.send est actif mais la signature n’est pas autorisée", async () => {
    state.connections = [{ broker: "maxime", connected: true, gmailSendEnabled: true, gmailSignatureEnabled: false }];
    const response = await connect(new Request("https://crm.example.com/api/google-calendar/connect?broker=maxime&capability=gmail&returnTo=/settings"));
    expect(new URL(response.headers.get("location")!).origin).toBe("https://accounts.google.com");
  });

  it("sauvegarde l’upgrade Gmail puis revient au Contact local", async () => {
    state.connections = [{ broker: "maxime", connected: true, gmailSendEnabled: false, gmailSignatureEnabled: false }];
    const response = await callback(new Request("https://crm.example.com/api/google-calendar/callback?code=oauth-code&state=signed-state"));
    expect(state.exchange).toHaveBeenCalledTimes(1);
    expect(state.save).toHaveBeenCalledWith("maxime", expect.objectContaining({ access_token: "access" }));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/contacts/11111111-1111-4111-8111-111111111111");
    expect(location.searchParams.get("gmail")).toBe("connected");
  });
});
