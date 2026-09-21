"use client";
import type { ReactNode } from "react";
import { useBroker } from "../broker-context";
import { SelectionPage } from "../selection-page";
export function WorkspaceGate({ children }: { children: ReactNode }) {
  const { isBrokerReady, selectedBroker } = useBroker();
  if (!isBrokerReady) return <p role="status">Chargement de l’espace…</p>;
  return selectedBroker ? children : <SelectionPage />;
}
