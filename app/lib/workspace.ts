export const WORKSPACE_USERS = ["france", "maxime", "sandrine", "immoplus"] as const;
export const BUSINESS_BROKERS = ["france", "maxime", "sandrine"] as const;
export type WorkspaceUser = typeof WORKSPACE_USERS[number];
export type WorkingBroker = typeof BUSINESS_BROKERS[number];
export type WorkspaceSession = { workspaceUser: WorkspaceUser | null; workingBroker: WorkingBroker | null };
export function isWorkspaceUser(value: unknown): value is WorkspaceUser {
  return WORKSPACE_USERS.some((item) => item === value);
}
export function isWorkingBroker(value: unknown): value is WorkingBroker {
  return BUSINESS_BROKERS.some((item) => item === value);
}
export function workspaceCapabilities(user: WorkspaceUser | null) {
  return { role: user === "maxime" ? "admin" : user === "immoplus" ? "assistant" : "broker",
    administerRecommendations: user === "maxime", switchWorkingBroker: user === "immoplus" } as const;
}
export function restoreWorkspace(storage: Pick<Storage, "getItem">): WorkspaceSession {
  const workspace = storage.getItem("selected-workspace");
  if (isWorkspaceUser(workspace)) {
    const broker = storage.getItem("working-broker");
    return { workspaceUser: workspace, workingBroker: workspace === "immoplus" ? isWorkingBroker(broker) ? broker : null : workspace };
  }
  const legacy = storage.getItem("selected-broker")?.toLowerCase();
  return isWorkingBroker(legacy) ? { workspaceUser: legacy, workingBroker: legacy } : { workspaceUser: null, workingBroker: null };
}
export function persistWorkspace(storage: Pick<Storage, "setItem" | "removeItem">, session: WorkspaceSession) {
  for (const [key, value] of [["selected-workspace", session.workspaceUser], ["working-broker", session.workingBroker]] as const) {
    if (value) storage.setItem(key, value); else storage.removeItem(key);
  }
  storage.removeItem("selected-broker");
}
