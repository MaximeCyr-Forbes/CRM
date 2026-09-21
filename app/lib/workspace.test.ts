import { describe, expect, it, vi, afterEach } from "vitest";
import { BUSINESS_BROKERS, WORKSPACE_USERS, isWorkingBroker, persistWorkspace, restoreWorkspace, workspaceCapabilities } from "./workspace";
import { createWorkspaceToken, requireWorkspaceAdmin } from "./crm-access";
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());
function storage(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
describe("Immoplus workspace", () => {
  it("keeps four users separate from three business brokers", () => {
    expect(WORKSPACE_USERS).toEqual(["france", "maxime", "sandrine", "immoplus"]);
    expect(BUSINESS_BROKERS).toEqual(["france", "maxime", "sandrine"]);
    expect(isWorkingBroker("immoplus")).toBe(false);
  });
  it.each(["France", "Maxime", "Sandrine"])("migrates legacy %s without a second selector", (broker) => {
    const store = storage({ "selected-broker": broker });
    const restored = restoreWorkspace(store);
    expect(restored).toEqual({ workspaceUser: broker.toLowerCase(), workingBroker: broker.toLowerCase() });
    persistWorkspace(store, restored);
    expect(store.getItem("selected-broker")).toBeNull();
    expect(restoreWorkspace(store)).toEqual(restored);
  });
  it("never gives a new assistant an implicit broker", () => {
    expect(restoreWorkspace(storage({ "selected-workspace": "immoplus", "selected-broker": "Maxime" }))).toEqual({ workspaceUser: "immoplus", workingBroker: null });
  });
  it.each(BUSINESS_BROKERS)("restores assistant working for %s without admin rights", (workingBroker) => {
    const store = storage();
    persistWorkspace(store, { workspaceUser: "immoplus", workingBroker });
    expect(restoreWorkspace(store)).toEqual({ workspaceUser: "immoplus", workingBroker });
    expect(workspaceCapabilities(restoreWorkspace(store).workspaceUser)).toEqual({ role: "assistant", administerRecommendations: false, switchWorkingBroker: true });
  });
  it("rejects invalid persisted broker and forces regular user to own broker", () => {
    expect(restoreWorkspace(storage({ "selected-workspace": "immoplus", "working-broker": "immoplus" })).workingBroker).toBeNull();
    expect(restoreWorkspace(storage({ "selected-workspace": "france", "working-broker": "maxime" })).workingBroker).toBe("france");
  });
  it.each(WORKSPACE_USERS)("checks signed server rights for %s independently of working broker", async (user) => {
    vi.stubEnv("CRM_ACCESS_PASSWORD", "synthetic-test-password");
    const token = await createWorkspaceToken(user);
    const denied = await requireWorkspaceAdmin(new Request("http://localhost", { headers: { "X-CRM-Workspace": token, "X-Working-Broker": "maxime" } }));
    expect(denied?.status ?? 200).toBe(user === "maxime" ? 200 : 403);
  });
  it("rejects missing and tampered workspace tokens", async () => {
    vi.stubEnv("CRM_ACCESS_PASSWORD", "synthetic-test-password");
    const token = (await createWorkspaceToken("immoplus")).replace("immoplus", "maxime");
    expect((await requireWorkspaceAdmin(new Request("http://localhost", { headers: { "X-CRM-Workspace": token } })))?.status).toBe(403);
    expect((await requireWorkspaceAdmin(new Request("http://localhost")))?.status).toBe(403);
  });
});
