import { restoreWorkspace } from "./workspace";
// Per-request, per-tab identity: changing the working broker cannot promote an assistant.
export async function workspaceRequest(url: string, init: RequestInit = {}) {
  const user = restoreWorkspace(window.sessionStorage).workspaceUser;
  const session = await fetch("/api/access/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceUser: user }) });
  if (!session.ok) throw new Error("Espace utilisateur indisponible.");
  const { token } = await session.json() as { token: string };
  if (restoreWorkspace(window.sessionStorage).workspaceUser !== user) throw new Error("L’espace utilisateur a changé.");
  const headers = new Headers(init.headers);
  headers.set("X-CRM-Workspace", token);
  return fetch(url, { ...init, headers });
}
