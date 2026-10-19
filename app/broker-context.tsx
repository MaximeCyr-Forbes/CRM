"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { persistWorkspace, restoreWorkspace, workspaceCapabilities, type WorkspaceSession, type WorkspaceUser, type WorkingBroker } from "./lib/workspace";

import { useAuth } from "./auth-context";

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
  const { member, status } = useAuth();
  const [session, setSession] = useState<WorkspaceSession>({ workspaceUser: null, workingBroker: null });
  const [isBrokerReady, setIsBrokerReady] = useState(false);
  useEffect(() => {
    if (status === "loading") return;
    const restored = member ? { workspaceUser: member.broker, workingBroker: member.broker } : restoreWorkspace(window.sessionStorage);
    persistWorkspace(window.sessionStorage, restored);
    setSession(restored);
    setIsBrokerReady(true);
  }, [member, status]);
  const changeSession = useCallback((next: WorkspaceSession) => {
    persistWorkspace(window.sessionStorage, next);
    setSession(next);
  }, []);
  const selectWorkspace = useCallback((user: WorkspaceUser) => {
    if (member) {
      if (user !== "immoplus" && member.brokers.includes(user)) changeSession({ workspaceUser: member.broker, workingBroker: user });
      return;
    }
    changeSession({ workspaceUser: user, workingBroker: user === "immoplus" ? null : user });
  }, [changeSession, member]);
  const selectBroker = useCallback((broker: Broker) => {
    const key = broker.toLowerCase() as WorkingBroker;
    if (member) {
      if (member.brokers.includes(key)) changeSession({ workspaceUser: member.broker, workingBroker: key });
      return;
    }
    changeSession({ workspaceUser: session.workspaceUser === "immoplus" ? "immoplus" : key, workingBroker: key });
  }, [changeSession, session.workspaceUser, member]);
  const clearBroker = useCallback(() => changeSession({ workspaceUser: null, workingBroker: null }), [changeSession]);
  const value = useMemo(() => ({ ...session, selectedBroker: session.workingBroker ? LABELS[session.workingBroker] : null,
    capabilities: member ? { role: member.role, administerRecommendations: true, switchWorkingBroker: true } : workspaceCapabilities(session.workspaceUser), isBrokerReady, selectWorkspace, selectBroker, clearBroker }),
  [session, isBrokerReady, selectWorkspace, selectBroker, clearBroker, member]);
  // Remount scoped providers/pages: late responses cannot populate the new broker's state.
  return <BrokerContext.Provider value={value}><Fragment key={`${session.workspaceUser}:${session.workingBroker}`}>{children}</Fragment></BrokerContext.Provider>;
}
export function useBroker() {
  const context = useContext(BrokerContext);
  if (!context) throw new Error("useBroker doit être utilisé dans BrokerProvider");
  return context;
}
