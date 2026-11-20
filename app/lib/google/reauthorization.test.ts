import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { GoogleConnectionRow } from "./connection";
import type { CRMMember } from "../auth/identity";

const mock = vi.hoisted(() => ({ connection: null as GoogleConnectionRow | null, rows: new Map<string, Record<string, unknown>>(), writes: vi.fn(), cas: true }));
vi.mock("./connection", () => ({ getGoogleConnection: async () => mock.connection }));
vi.mock("../google-calendar/config", () => ({ getGoogleOAuthConfig: () => ({ stateSecret: "test-only-secret" }) }));
vi.mock("../google-calendar/token-crypto", () => ({ encryptGoogleToken: async (value: string) => `encrypted:${value}` }));
vi.mock("./credential-access", () => ({ googleConnectionDatabase: () => ({ from: (table: string) => {
  const filters = new Map<string, unknown>();
  let expiry = "";
  const builder = {
    eq: (key: string, value: unknown) => { filters.set(key, value); return builder; },
    gt: (_key: string, value: string) => { expiry = value; return builder; },
    select: () => builder,
    maybeSingle: async () => {
      if (table === "google_calendar_connections") return { data: mock.cas ? { broker: "france" } : null, error: null };
      const key = filters.get("state_hash") as string;
      const row = mock.rows.get(key);
      if (!row || [...filters].some(([k, v]) => row[k] !== v) || String(row.expires_at) <= expiry) return { data: null, error: null };
      mock.rows.delete(key);
      return { data: row, error: null };
    },
  };
  return {
    insert: async (row: Record<string, unknown>) => { mock.rows.set(row.state_hash as string, row); return { error: null }; },
    delete: () => builder,
    update: (data: unknown) => { mock.writes(table, data); return builder; },
  };
} }) }));

import { crmMemberContext } from "../auth/context";
import { beginGoogleReauthorization, consumeGoogleReauthorization, persistGoogleReauthorization } from "./reauthorization";
import { verifyOAuthState } from "../google-calendar/oauth-state";
const member: CRMMember = { memberId: "member", identityId: "identity", authUserId: "actor", broker: "france", role: "broker", brokers: ["france"] };
const run = <T>(fn: () => T) => crmMemberContext.run(member, fn);
const scopes = ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.settings.basic", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/drive.file"];
const tokens = { access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, scope: scopes.join(" ") };
let identity: Record<string, unknown>;
beforeEach(() => {
  mock.connection = { broker: "france", google_account_email: "france@example.test", calendar_id: "existing-calendar", encrypted_access_token: "old-access", encrypted_refresh_token: "old-refresh", access_token_expires_at: "2020-01-01", scopes: [...scopes] };
  mock.rows.clear(); mock.writes.mockClear(); mock.cas = true;
  identity = { email: "france@example.test", email_verified: true, sub: "verified-subject" };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url !== "https://openidconnect.googleapis.com/v1/userinfo") throw new Error("Real Google calls forbidden in tests");
    return Response.json(identity);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("explicit Google reauthorization", () => {
  it("signs broker/mode and preserves all existing requested scopes, with no tokens in state", async () => run(async () => {
    const attempt = await beginGoogleReauthorization("france");
    expect(attempt.scopes).toEqual(expect.arrayContaining(scopes));
    const payload = await verifyOAuthState(attempt.state);
    expect(payload).toMatchObject({ broker: "france", capability: "gmail", mode: "reauthorize", returnTo: "/settings?googleReauthorize=1" });
    expect(JSON.stringify(payload)).not.toContain("old-refresh");
    expect(JSON.stringify([...mock.rows.values()])).not.toContain("old-refresh");
  }));
  it("atomically consumes exactly once under concurrent callbacks", async () => run(async () => {
    const { state } = await beginGoogleReauthorization("france");
    const result = await Promise.allSettled([consumeGoogleReauthorization("france", state), consumeGoogleReauthorization("france", state)]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(mock.writes).not.toHaveBeenCalled();
  }));
  it("rejects another actor and broker without consuming the legitimate attempt", async () => run(async () => {
    const { state } = await beginGoogleReauthorization("france");
    await expect(crmMemberContext.run({ ...member, authUserId: "another" }, () => consumeGoogleReauthorization("france", state))).rejects.toThrow();
    await expect(consumeGoogleReauthorization("maxime", state)).rejects.toThrow();
    await expect(consumeGoogleReauthorization("france", state)).resolves.toMatchObject({ broker: "france" });
  }));
  it("rejects unauthenticated initiation", async () => {
    await expect(beginGoogleReauthorization("france")).rejects.toThrow("Identité CRM");
  });
  it("rejects expiry and changed connection", async () => run(async () => {
    const first = await beginGoogleReauthorization("france");
    for (const row of mock.rows.values()) row.expires_at = "2000-01-01";
    await expect(consumeGoogleReauthorization("france", first.state)).rejects.toThrow();
    const second = await beginGoogleReauthorization("france");
    mock.connection!.encrypted_refresh_token = "changed";
    await expect(consumeGoogleReauthorization("france", second.state)).rejects.toThrow("changé");
  }));
  it("encrypts both new credentials without touching calendar, identity, contacts or histories", async () => run(async () => {
    await persistGoogleReauthorization(mock.connection!, tokens);
    expect(mock.writes).toHaveBeenCalledTimes(1);
    expect(mock.writes).toHaveBeenCalledWith("google_calendar_connections", {
      encrypted_access_token: "encrypted:new-access", encrypted_refresh_token: "encrypted:new-refresh", access_token_expires_at: expect.any(String), scopes,
    });
    expect(mock.connection!.calendar_id).toBe("existing-calendar");
  }));
  it.each([
    { email: "maxime@example.test", email_verified: true, sub: "other" },
    { email: "france@example.test", email_verified: false, sub: "same" },
    { email: "france@example.test", email_verified: true },
  ])("rejects different or unverified identity without writes: %j", async value => run(async () => {
    identity = value;
    await expect(persistGoogleReauthorization(mock.connection!, tokens)).rejects.toThrow();
    expect(mock.writes).not.toHaveBeenCalled();
  }));
  it("requires a new refresh token and all existing scopes", async () => run(async () => {
    await expect(persistGoogleReauthorization(mock.connection!, { ...tokens, refresh_token: undefined })).rejects.toThrow();
    await expect(persistGoogleReauthorization(mock.connection!, { ...tokens, scope: "openid email" })).rejects.toThrow();
    expect(mock.writes).not.toHaveBeenCalled();
  }));
  it("fails when credentials changed during consent", async () => run(async () => {
    mock.cas = false;
    await expect(persistGoogleReauthorization(mock.connection!, tokens)).rejects.toThrow();
  }));
});
