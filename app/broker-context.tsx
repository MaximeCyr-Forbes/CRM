"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { persistWorkspace, restoreWorkspace, workspaceCapabilities, type WorkspaceSession, type WorkspaceUser, type WorkingBroker } from "./lib/workspace";

export const BROKERS = ["France", "Maxime", "Sandrine"] as const;
export type Broker = typeof BROKERS[number];
const LABELS: Record<WorkingBroker, Broker> = { france: "France", maxime: "Maxime", sandrine: "Sandrine" };
type BrokerContextValue = WorkspaceSession & {
  selectedBroker: Broker | null;
  capabilities: ReturnType<typeof workspaceCapabilities>;
  isBrokerReady: boolean;
  selectWorkspace: (user: WorkspaceUser) => void;
  selectBroker: (broker: Broker) => void;
  clearBroker: () => void;
};
const BrokerContext = createContext<BrokerContextValue | null>(null);
export function BrokerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WorkspaceSession>({ workspaceUser: null, workingBroker: null });
  const [isBrokerReady, setIsBrokerReady] = useState(false);
  useEffect(() => {
    const restored = restoreWorkspace(window.sessionStorage);
    persistWorkspace(window.sessionStorage, restored);
    setSession(restored);
    setIsBrokerReady(true);
  }, []);
  const changeSession = useCallback((next: WorkspaceSession) => {
    persistWorkspace(window.sessionStorage, next);
    setSession(next);
  }, []);
  const selectWorkspace = useCallback((user: WorkspaceUser) => {
    changeSession({ workspaceUser: user, workingBroker: user === "immoplus" ? null : user });
  }, [changeSession]);
  const selectBroker = useCallback((broker: Broker) => {
    const key = broker.toLowerCase() as WorkingBroker;
    changeSession({ workspaceUser: session.workspaceUser === "immoplus" ? "immoplus" : key, workingBroker: key });
  }, [changeSession, session.workspaceUser]);
  const clearBroker = useCallback(() => changeSession({ workspaceUser: null, workingBroker: null }), [changeSession]);
  const value = useMemo(() => ({ ...session, selectedBroker: session.workingBroker ? LABELS[session.workingBroker] : null,
    capabilities: workspaceCapabilities(session.workspaceUser), isBrokerReady, selectWorkspace, selectBroker, clearBroker }),
  [session, isBrokerReady, selectWorkspace, selectBroker, clearBroker]);
  // Remount scoped providers/pages: late responses cannot populate the new broker's state.
  return <BrokerContext.Provider value={value}><Fragment key={`${session.workspaceUser}:${session.workingBroker}`}>{children}</Fragment></BrokerContext.Provider>;
}
export function useBroker() {
  const context = useContext(BrokerContext);
  if (!context) throw new Error("useBroker doit être utilisé dans BrokerProvider");
  return context;
}
