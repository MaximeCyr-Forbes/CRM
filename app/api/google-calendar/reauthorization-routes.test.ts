import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ begin: vi.fn(), consume: vi.fn(), persist: vi.fn(), exchange: vi.fn(), save: vi.fn(), status: vi.fn(), prepare: vi.fn() }));
vi.mock("../../lib/auth/route", () => ({ withCRMIdentity: (handler: unknown) => handler }));
vi.mock("../../lib/crm-access", () => ({ requireApiAccess: async () => ({ response: null }) }));
vi.mock("../../lib/google-calendar/config", () => ({ getApplicationOrigin: () => "https://crm.test", getGoogleRedirectUri: () => "https://crm.test/api/google-calendar/callback", getGoogleOAuthConfig: () => ({ clientId: "test-client" }) }));
vi.mock("../../lib/google/reauthorization", () => ({ beginGoogleReauthorization: mocks.begin, consumeGoogleReauthorization: mocks.consume, persistGoogleReauthorization: mocks.persist }));
vi.mock("../../lib/google-calendar/oauth-state", async original => ({ ...await original<typeof import("../../lib/google-calendar/oauth-state")>(), verifyOAuthState: async () => ({ broker: "france", capability: "gmail", returnTo: "/settings?googleReauthorize=1", mode: "reauthorize" }) }));
vi.mock("../../lib/google-calendar/service", () => ({ listGoogleConnectionStatuses: mocks.status, exchangeGoogleAuthorizationCode: mocks.exchange, saveGoogleConnection: mocks.save }));
vi.mock("../../lib/google-gmail/service", () => ({ prepareGmailSender: mocks.prepare }));
import { GET as connect } from "./connect/route";
import { GET as callback } from "./callback/route";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Live network forbidden"); }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.begin.mockResolvedValue({ state: "signed", email: "france@example.test", scopes: ["openid", "email", "gmail-scope", "calendar-scope"] });
  mocks.consume.mockResolvedValue({ broker: "france" });
  mocks.exchange.mockResolvedValue({ access_token: "mock-only" });
  mocks.persist.mockResolvedValue(undefined); mocks.prepare.mockResolvedValue({ identity: {} });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const finish = (query = "code=test&state=signed") => callback(new Request(`https://crm.test/api/google-calendar/callback?${query}`));
it("explicit reauthorization bypasses already-connected with real Google consent URL", async () => {
  const response = await connect(new Request("https://crm.test/api/google-calendar/connect?broker=france&capability=gmail&mode=reauthorize"));
  const url = new URL(response.headers.get("location")!);
  expect(url.origin).toBe("https://accounts.google.com");
  expect(url.searchParams.get("prompt")).toBe("consent");
  expect(url.searchParams.get("access_type")).toBe("offline");
  expect(url.searchParams.get("login_hint")).toBe("france@example.test");
  expect(mocks.status).not.toHaveBeenCalled();
});
it("successful callback stores credentials and reads SendAs, never the calendar/contact saving workflow", async () => {
  const response = await finish();
  expect(response.headers.get("location")).toContain("gmail=reauthorized");
  expect(mocks.consume).toHaveBeenCalledWith("france", "signed");
  expect(mocks.persist).toHaveBeenCalledTimes(1);
  expect(mocks.prepare).toHaveBeenCalledWith("france");
  expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.status).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("cancel consumes state without exchange, token writes or reads", async () => {
  const response = await finish("state=signed&error=access_denied");
  expect(response.headers.get("location")).toContain("gmail=cancelled");
  expect(mocks.consume).toHaveBeenCalledTimes(1);
  expect(mocks.exchange).not.toHaveBeenCalled(); expect(mocks.persist).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
});
it("replay is rejected before exchanging code", async () => {
  mocks.consume.mockRejectedValue(new Error("already used"));
  expect((await finish()).headers.get("location")).toContain("gmail=reauthorization-error");
  expect(mocks.exchange).not.toHaveBeenCalled(); expect(mocks.persist).not.toHaveBeenCalled();
});
it("Google exchange failure leaves credentials intact", async () => {
  mocks.exchange.mockRejectedValue(new Error("OAuth failed"));
  expect((await finish()).headers.get("location")).toContain("gmail=reauthorization-error");
  expect(mocks.persist).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it("identity rejection does not read Gmail", async () => {
  mocks.persist.mockRejectedValue(new Error("wrong identity"));
  expect((await finish()).headers.get("location")).toContain("gmail=reauthorization-error");
  expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it("SendAs read failure is reported separately from successful consent", async () => {
  mocks.prepare.mockRejectedValue(new Error("read failed"));
  expect((await finish()).headers.get("location")).toContain("gmail=reauthorized-read-error");
});
