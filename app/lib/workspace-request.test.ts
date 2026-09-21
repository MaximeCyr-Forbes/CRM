import { afterEach, expect, it, vi } from "vitest";
import { workspaceRequest } from "./workspace-request";
afterEach(() => vi.unstubAllGlobals());
it("does not dispatch an old administrator action after switching to Immoplus", async () => {
  let user = "maxime";
  vi.stubGlobal("window", { sessionStorage: { getItem: (key: string) => key === "selected-workspace" ? user : "maxime" } });
  let resolve!: (response: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
  vi.stubGlobal("fetch", fetchMock);
  const request = workspaceRequest("/api/recommendations");
  user = "immoplus";
  resolve(Response.json({ token: "synthetic-token" }));
  await expect(request).rejects.toThrow("L’espace utilisateur a changé");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("sends assistant identity independently of a Maxime working context", async () => {
  vi.stubGlobal("window", { sessionStorage: { getItem: (key: string) => key === "selected-workspace" ? "immoplus" : "maxime" } });
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ token: "assistant-token" })).mockResolvedValueOnce(Response.json({}));
  vi.stubGlobal("fetch", fetchMock);
  await workspaceRequest("/api/recommendations");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ workspaceUser: "immoplus" });
  expect(fetchMock.mock.calls[1][1].headers.get("X-CRM-Workspace")).toBe("assistant-token");
});
