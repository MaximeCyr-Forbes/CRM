import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  update: vi.fn(),
  decrypt: vi.fn(),
  encrypt: vi.fn(),
}));

vi.mock("../supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ update: state.update }),
  }),
}));
vi.mock("../google-calendar/config", () => ({
  getGoogleOAuthConfig: () => ({ clientId: "client", clientSecret: "secret", stateSecret: "state" }),
}));
vi.mock("../google-calendar/token-crypto", () => ({
  decryptGoogleToken: state.decrypt,
  encryptGoogleToken: state.encrypt,
}));

import { googleAuthenticatedRequest, type GoogleConnectionRow } from "./connection";

const connection: GoogleConnectionRow = {
  broker: "maxime",
  google_account_email: "maxime@example.com",
  calendar_id: "primary",
  encrypted_access_token: "access-encrypted",
  encrypted_refresh_token: "refresh-encrypted",
  access_token_expires_at: "2099-01-01T00:00:00.000Z",
  scopes: [],
};

describe("requêtes Google authentifiées", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    state.decrypt.mockReset().mockImplementation(async (value: string) => value === "refresh-encrypted" ? "refresh-token" : "access-token");
    state.encrypt.mockReset().mockResolvedValue("new-access-encrypted");
    state.update.mockReset().mockReturnValue({ eq: vi.fn(async () => ({ error: null })) });
  });

  it("rafraîchit le jeton et réessaie exactement une fois après un 401", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ access_token: "new-access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json({ id: "sent" }));

    const response = await googleAuthenticatedRequest(connection, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST" });
    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("https://oauth2.googleapis.com/token");
    expect((fetchMock.mock.calls[2][1]?.headers as Record<string, string>).Authorization).toBe("Bearer new-access-token");
  });
});
