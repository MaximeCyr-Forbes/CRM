import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  connections: [] as Array<{
    broker: "france" | "maxime" | "sandrine";
    connected: boolean;
    gmailSendEnabled: boolean;
    gmailSignatureEnabled: boolean;
    driveEnabled?: boolean;
    centrisShowings: { scopeGranted: boolean; calendarDetected: boolean; status: "synchronized" | "authorization_required" | "not_detected" | "unavailable" };
  }>,
  exchange: vi.fn(),
  save: vi.fn(),
  verified: {
    broker: "maxime" as const,
    capability: "gmail" as "calendar" | "gmail" | "drive",
    returnTo: "/contacts/11111111-1111-4111-8111-111111111111",
  },
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
import { GoogleAccountRefreshTokenMismatchError } from "../../lib/google/google-account";

describe("routes OAuth Gmail", () => {
  beforeEach(() => {
    state.connections = [];
    state.exchange.mockReset().mockResolvedValue({ access_token: "access", expires_in: 3600, scope: "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.settings.basic" });
    state.save.mockReset().mockResolvedValue(undefined);
    state.verified = { broker: "maxime", capability: "gmail", returnTo: "/contacts/11111111-1111-4111-8111-111111111111" };
  });

  it("relance OAuth si Agenda est connecté mais gmail.send absent", async () => {
    state.connections = [{ broker: "maxime", connected: true, gmailSendEnabled: false, gmailSignatureEnabled: false, centrisShowings: { scopeGranted: true, calendarDetected: true, status: "synchronized" } }];
    const response = await connect(new Request("https://crm.example.com/api/google-calendar/connect?broker=maxime&capability=gmail&returnTo=/contacts/11111111-1111-4111-8111-111111111111"));
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("scope")?.split(" ")).toEqual(["openid", "email", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.settings.basic"]);
    expect(location.searchParams.get("include_granted_scopes")).toBe("true");
  });

  it("relance OAuth si gmail.send est actif mais la signature n’est pas autorisée", async () => {
    state.connections = [{ broker: "maxime", connected: true, gmailSendEnabled: true, gmailSignatureEnabled: false, centrisShowings: { scopeGranted: true, calendarDetected: true, status: "synchronized" } }];
    const response = await connect(new Request("https://crm.example.com/api/google-calendar/connect?broker=maxime&capability=gmail&returnTo=/settings"));
    expect(new URL(response.headers.get("location")!).origin).toBe("https://accounts.google.com");
  });

  it("sauvegarde l’upgrade Gmail puis revient au Contact local", async () => {
    state.connections = [{ broker: "maxime", connected: true, gmailSendEnabled: false, gmailSignatureEnabled: false, centrisShowings: { scopeGranted: true, calendarDetected: true, status: "synchronized" } }];
    const response = await callback(new Request("https://crm.example.com/api/google-calendar/callback?code=oauth-code&state=signed-state"));
    expect(state.exchange).toHaveBeenCalledTimes(1);
    expect(state.save).toHaveBeenCalledWith("maxime", expect.objectContaining({ access_token: "access" }));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/contacts/11111111-1111-4111-8111-111111111111");
    expect(location.searchParams.get("gmail")).toBe("connected");
  });

  it("relance OAuth pour un Agenda déjà connecté auquel le scope CalendarList manque", async () => {
    state.connections = [{ broker: "maxime", connected: true, gmailSendEnabled: true, gmailSignatureEnabled: true, centrisShowings: { scopeGranted: false, calendarDetected: false, status: "authorization_required" } }];
    const response = await connect(new Request("https://crm.example.com/api/google-calendar/connect?broker=maxime&capability=calendar&returnTo=/settings"));
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("scope")?.split(" ")).toContain("https://www.googleapis.com/auth/calendar.calendarlist.readonly");
  });

  it("ne relance pas OAuth lorsque le scope CalendarList est déjà accordé", async () => {
    state.connections = [{ broker: "maxime", connected: true, gmailSendEnabled: true, gmailSignatureEnabled: true, centrisShowings: { scopeGranted: true, calendarDetected: false, status: "not_detected" } }];
    const response = await connect(new Request("https://crm.example.com/api/google-calendar/connect?broker=maxime&capability=calendar&returnTo=/settings"));
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://crm.example.com");
    expect(location.searchParams.get("google")).toBe("already-connected");
  });

  it("demande uniquement drive.file avec l’identité de base pour Google Drive", async () => {
    state.connections = [{ broker: "maxime", connected: true, gmailSendEnabled: true, gmailSignatureEnabled: true, driveEnabled: false, centrisShowings: { scopeGranted: true, calendarDetected: true, status: "synchronized" } }];
    const response = await connect(new Request("https://crm.example.com/api/google-calendar/connect?broker=maxime&capability=drive&returnTo=/settings"));
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("scope")?.split(" ")).toEqual([
      "openid",
      "email",
      "https://www.googleapis.com/auth/drive.file",
    ]);
    expect(location.searchParams.get("scope")).not.toContain("calendar");
    expect(location.searchParams.get("scope")).not.toContain("gmail");
    expect(location.searchParams.get("include_granted_scopes")).toBe("true");
  });

  it.each([
    { capability: "calendar" as const, parameter: "google" },
    { capability: "gmail" as const, parameter: "gmail" },
  ])("redirige $capability vers account-change-required sans annoncer une connexion", async ({ capability, parameter }) => {
    state.verified = { broker: "maxime", capability, returnTo: "/settings" };
    state.save.mockRejectedValueOnce(new GoogleAccountRefreshTokenMismatchError());
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await callback(new Request("https://crm.example.com/api/google-calendar/callback?code=oauth-code&state=signed-state"));
    const location = new URL(response.headers.get("location")!);

    expect(location.pathname).toBe("/settings");
    expect(location.searchParams.get(parameter)).toBe("account-change-required");
    expect(location.searchParams.get(parameter)).not.toBe("connected");
    expect(consoleError).toHaveBeenCalledWith(
      "Erreur callback Google OAuth:",
      expect.stringContaining("compte Google sélectionné est différent"),
    );
  });
});
