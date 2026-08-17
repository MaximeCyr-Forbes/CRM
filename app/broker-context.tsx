"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export const BROKERS = ["France", "Maxime", "Sandrine"] as const;

export type Broker = (typeof BROKERS)[number];

type BrokerContextValue = {
  selectedBroker: Broker | null;
  selectBroker: (broker: Broker) => void;
  clearBroker: () => void;
};

const BrokerContext = createContext<BrokerContextValue | null>(null);

export function BrokerProvider({ children }: { children: ReactNode }) {
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null);

  const value = useMemo(
    () => ({
      selectedBroker,
      selectBroker: setSelectedBroker,
      clearBroker: () => setSelectedBroker(null),
    }),
    [selectedBroker],
  );

  return <BrokerContext.Provider value={value}>{children}</BrokerContext.Provider>;
}

export function useBroker() {
  const context = useContext(BrokerContext);

  if (!context) {
    throw new Error("useBroker doit être utilisé dans BrokerProvider");
  }

  return context;
}
