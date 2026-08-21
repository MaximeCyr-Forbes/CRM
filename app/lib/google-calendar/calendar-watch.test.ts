import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state: {
    connection: Record<string, unknown>;
    watch: Record<string, unknown> | null;
    rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  } = {
    connection: {
      broker: "maxime",
      google_account_email: "maxime@example.com",
      calendar_id: "primary",
      encrypted_access_token: "encrypted-access",
      encrypted_refresh_token: "encrypted-refresh",
      access_token_expires_at: "2099-01-01T00:00:00.000Z",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    },
    watch: null,
    rpcCalls: [],
  };

  class Query {
    table: string;
    operation = "select";
    payload: Record<string, unknown> | null = null;
    filters = new Map<string, unknown>();
    constructor(table: string) { this.table = table; }
    select() { this.operation = "select"; return this; }
    eq(column: string, value: unknown) { this.filters.set(column, value); return this; }
    maybeSingle() { return Promise.resolve(this.execute()); }
    upsert(payload: Record<string, unknown>) { this.operation = "upsert"; this.payload = payload; return this; }
    update(payload: Record<string, unknown>) { this.operation = "update"; this.payload = payload; return this; }
    delete() { this.operation = "delete"; return this; }
    execute() {
      if (this.table === "google_calendar_connections") {
        return { data: this.operation === "select" ? state.connection : null, error: null };
      }
      if (this.table !== "google_calendar_watch_channels") return { data: null, error: null };
      const matches = !state.watch || [...this.filters].every(([key, value]) => state.watch?.[key] === value);
      if (this.operation === "select") return { data: matches ? state.watch : null, error: null };
      if (this.operation === "upsert") {
        state.watch = { ...(this.payload ?? {}) };
      } else if (this.operation === "update" && state.watch && matches) {
        state.watch = { ...state.watch, ...(this.payload ?? {}) };
      } else if (this.operation === "delete" && matches) {
        state.watch = null;
      }
      return { data: null, error: null };
    }
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(this.execute()).then(resolve, reject);
    }
  }

  const admin = {
    from: (table: string) => new Query(table),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      if (state.watch && state.watch.channel_id === args.p_channel_id) {
        state.watch.resource_id ??= args.p_resource_id;
        state.watch.last_notification_at = "2026-08-21T18:00:00.000Z";
        state.watch.last_resource_state = args.p_resource_state;
        if (["exists", "not_exists"].includes(String(args.p_resource_state))) {
          state.watch.change_version = Number(state.watch.change_version ?? 0) + 1;
        }
      }
      return { data: state.watch?.change_version ?? null, error: null };
    }),
  };
  return { state, admin };
});

vi.mock("../supabase/server", () => ({ getSupabaseAdmin: () => mocks.admin }));
vi.mock("./config", () => ({ getGoogleOAuthConfig: () => ({ clientId: "client", clientSecret: "secret", stateSecret: "state" }) }));
vi.mock("./token-crypto", () => ({
  decryptGoogleToken: vi.fn(async () => "access-token"),
  encryptGoogleToken: vi.fn(async (value: string) => `encrypted:${value}`),
}));

import {
  ensureGoogleCalendarWatch,
  processGoogleCalendarWebhook,
  startGoogleCalendarWatch,
} from "./service";

async function sha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("notifications push Google Calendar", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://crm.equipeforbes.test";
    delete process.env.VERCEL_ENV;
    mocks.state.watch = null;
    mocks.state.rpcCalls.length = 0;
    mocks.admin.rpc.mockClear();
    vi.restoreAllMocks();
  });

  it("crée events.watch avec UUID, HTTPS, token brut et TTL de 7 jours, sans stocker le token brut", async () => {
    let requestBody: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toContain("/calendars/primary/events/watch");
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ id: requestBody.id, resourceId: "resource-new", expiration: String(Date.now() + 7 * 86_400_000) });
    });
    const result = await startGoogleCalendarWatch("maxime");
    const capturedBody = requestBody as Record<string, unknown> | null;
    expect(capturedBody).toMatchObject({
      type: "web_hook",
      address: "https://crm.equipeforbes.test/api/google-calendar/webhook",
      params: { ttl: "604800" },
    });
    expect(String(capturedBody?.id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(String(capturedBody?.token).length).toBeGreaterThan(40);
    expect(mocks.state.watch?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(mocks.state.watch?.token_hash).not.toBe(capturedBody?.token);
    expect(result.watchActive).toBe(true);
  });

  it("ne recrée pas un canal qui expire dans cinq jours", async () => {
    mocks.state.watch = {
      broker: "maxime", calendar_id: "primary", channel_id: "healthy", resource_id: "resource",
      token_hash: "a".repeat(64), expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      change_version: 4, last_notification_at: null, last_resource_state: "sync",
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await ensureGoogleCalendarWatch("maxime");
    expect(result.watchActive).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ne crée aucun canal depuis un déploiement Vercel Preview", async () => {
    process.env.VERCEL_ENV = "preview";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(startGoogleCalendarWatch("maxime")).rejects.toThrow("déploiement Preview");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.state.watch).toBeNull();
  });

  it("crée le nouveau canal avant d’arrêter celui qui expire dans douze heures", async () => {
    mocks.state.watch = {
      broker: "maxime", calendar_id: "primary", channel_id: "old-channel", resource_id: "old-resource",
      token_hash: "a".repeat(64), expires_at: new Date(Date.now() + 12 * 3_600_000).toISOString(),
      change_version: 7, last_notification_at: null, last_resource_state: "exists",
    };
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input); calls.push(url);
      if (url.endsWith("/channels/stop")) return new Response(null, { status: 204 });
      const body = JSON.parse(String(init?.body)) as { id: string };
      return Response.json({ id: body.id, resourceId: "new-resource", expiration: String(Date.now() + 7 * 86_400_000) });
    });
    await ensureGoogleCalendarWatch("maxime");
    expect(calls[0]).toContain("/events/watch");
    expect(calls[1]).toContain("/channels/stop");
    expect(mocks.state.watch?.resource_id).toBe("new-resource");
  });

  it("restaure l’ancien canal si Google refuse le renouvellement", async () => {
    const oldWatch = {
      broker: "maxime", calendar_id: "primary", channel_id: "old-channel", resource_id: "old-resource",
      token_hash: "a".repeat(64), expires_at: new Date(Date.now() + 12 * 3_600_000).toISOString(),
      change_version: 7, last_notification_at: null, last_resource_state: "exists",
    };
    mocks.state.watch = { ...oldWatch };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    await expect(ensureGoogleCalendarWatch("maxime")).rejects.toThrow("Création du canal Google refusée");
    expect(mocks.state.watch).toEqual(oldWatch);
  });

  it("accepte sync avec resource pending, puis incrémente exists", async () => {
    const token = "channel-secret";
    mocks.state.watch = {
      broker: "maxime", calendar_id: "primary", channel_id: "channel", resource_id: null,
      token_hash: await sha256(token), expires_at: null, change_version: 10,
      last_notification_at: null, last_resource_state: null,
    };
    const sync = new Headers({
      "X-Goog-Channel-ID": "channel", "X-Goog-Channel-Token": token,
      "X-Goog-Resource-ID": "resource", "X-Goog-Resource-State": "sync",
      "X-Goog-Message-Number": "1",
    });
    expect(await processGoogleCalendarWebhook(sync)).toBe(true);
    expect(mocks.state.watch?.change_version).toBe(10);
    expect(mocks.state.watch?.resource_id).toBe("resource");
    sync.set("X-Goog-Resource-State", "exists");
    expect(await processGoogleCalendarWebhook(sync)).toBe(true);
    expect(mocks.state.watch?.change_version).toBe(11);
  });

  it("ignore token invalide, channel inconnu et resource ID différent", async () => {
    const token = "channel-secret";
    mocks.state.watch = {
      broker: "maxime", calendar_id: "primary", channel_id: "channel", resource_id: "resource",
      token_hash: await sha256(token), expires_at: "2099-01-01T00:00:00.000Z", change_version: 2,
      last_notification_at: null, last_resource_state: "sync",
    };
    const headers = new Headers({
      "X-Goog-Channel-ID": "channel", "X-Goog-Channel-Token": "invalid",
      "X-Goog-Resource-ID": "resource", "X-Goog-Resource-State": "exists",
    });
    expect(await processGoogleCalendarWebhook(headers)).toBe(false);
    headers.set("X-Goog-Channel-Token", token);
    headers.set("X-Goog-Channel-ID", "unknown");
    expect(await processGoogleCalendarWebhook(headers)).toBe(false);
    headers.set("X-Goog-Channel-ID", "channel");
    headers.set("X-Goog-Resource-ID", "different");
    expect(await processGoogleCalendarWebhook(headers)).toBe(false);
    expect(mocks.state.rpcCalls).toHaveLength(0);
  });
});
