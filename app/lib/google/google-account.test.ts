import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  connection: null as null | {
    broker: "maxime";
    google_account_email: string;
    calendar_id: string;
    encrypted_access_token: string;
    encrypted_refresh_token: string;
    access_token_expires_at: string;
    scopes: string[];
  },
  upsert: vi.fn(),
  decrypt: vi.fn(),
  encrypt: vi.fn(),
}));

vi.mock("../supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ upsert: state.upsert }),
  }),
}));
vi.mock("./connection", () => ({
  getGoogleConnection: vi.fn(async () => state.connection),
}));
vi.mock("../google-calendar/token-crypto", () => ({
  decryptGoogleToken: state.decrypt,
  encryptGoogleToken: state.encrypt,
}));

import {
  GoogleAccountRefreshTokenMismatchError,
  normalizeGoogleAccountEmail,
  persistGoogleConnection,
} from "./google-account";

const existingConnection = {
  broker: "maxime" as const,
  google_account_email: "maxime@example.com",
  calendar_id: "primary",
  encrypted_access_token: "old-access-encrypted",
  encrypted_refresh_token: "refresh-a-encrypted",
  access_token_expires_at: "2026-08-25T12:00:00.000Z",
  scopes: ["openid", "scope-existing"],
};

function mockUserInfo(email?: string) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(
    email === undefined ? {} : { email },
  ));
}

describe("identité de la connexion Google", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    state.connection = { ...existingConnection, scopes: [...existingConnection.scopes] };
    state.upsert.mockReset().mockResolvedValue({ error: null });
    state.decrypt.mockReset().mockResolvedValue("refresh-token-a");
    state.encrypt.mockReset().mockImplementation(async (value: string) => `encrypted:${value}`);
  });

  it("normalise la casse et réutilise le refresh token seulement pour le même compte", async () => {
    mockUserInfo("  Maxime@Example.com ");

    const result = await persistGoogleConnection("maxime", {
      access_token: "access-token-b",
      expires_in: 3600,
      scope: "openid scope-new",
    });

    expect(normalizeGoogleAccountEmail(" Maxime@Example.com ")).toBe("maxime@example.com");
    expect(state.decrypt).toHaveBeenCalledWith("refresh-a-encrypted");
    expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({
      google_account_email: "Maxime@Example.com",
      encrypted_access_token: "encrypted:access-token-b",
      encrypted_refresh_token: "encrypted:refresh-token-a",
      scopes: ["openid", "scope-existing", "scope-new"],
    }));
    expect(result.sameAccount).toBe(true);
  });

  it("refuse un compte différent sans nouveau refresh token sans aucune écriture", async () => {
    mockUserInfo("nouveau@example.com");

    await expect(persistGoogleConnection("maxime", {
      access_token: "access-token-b",
      expires_in: 3600,
      scope: "scope-new",
    })).rejects.toBeInstanceOf(GoogleAccountRefreshTokenMismatchError);

    expect(state.decrypt).not.toHaveBeenCalled();
    expect(state.encrypt).not.toHaveBeenCalled();
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it("accepte un nouveau compte avec son propre refresh token sans hériter des anciens scopes", async () => {
    mockUserInfo("nouveau@example.com");

    const result = await persistGoogleConnection("maxime", {
      access_token: "access-token-b",
      refresh_token: "refresh-token-b",
      expires_in: 3600,
      scope: "openid scope-new",
    });

    expect(state.decrypt).not.toHaveBeenCalled();
    expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({
      google_account_email: "nouveau@example.com",
      encrypted_access_token: "encrypted:access-token-b",
      encrypted_refresh_token: "encrypted:refresh-token-b",
      scopes: ["openid", "scope-new"],
    }));
    expect(result).toMatchObject({ sameAccount: false, scopes: ["openid", "scope-new"] });
  });

  it("refuse userinfo sans email avant toute lecture ou écriture de jeton", async () => {
    mockUserInfo();

    await expect(persistGoogleConnection("maxime", {
      access_token: "access-token-b",
      refresh_token: "refresh-token-b",
      expires_in: 3600,
    })).rejects.toThrow("adresse courriel valide");

    expect(state.decrypt).not.toHaveBeenCalled();
    expect(state.encrypt).not.toHaveBeenCalled();
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it("refuse une première connexion sans refresh token avant l’upsert", async () => {
    state.connection = null;
    mockUserInfo("maxime@example.com");

    await expect(persistGoogleConnection("maxime", {
      access_token: "access-token-b",
      expires_in: 3600,
    })).rejects.toThrow("aucun jeton de renouvellement");

    expect(state.upsert).not.toHaveBeenCalled();
  });
});
