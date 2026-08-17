"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const BROKERS = ["France", "Maxime", "Sandrine"] as const;

export type Broker = (typeof BROKERS)[number];

type BrokerContextValue = {
  selectedBroker: Broker | null;
  isBrokerReady: boolean;
  selectBroker: (broker: Broker) => void;
  clearBroker: () => void;
};

const BrokerContext = createContext<BrokerContextValue | null>(null);

export function BrokerProvider({ children }: { children: ReactNode }) {
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null);
  const [isBrokerReady, setIsBrokerReady] = useState(false);

  useEffect(() => {
    const savedBroker = window.sessionStorage.getItem("selected-broker");
    const persistedBroker = BROKERS.find((broker) => broker === savedBroker);
    setSelectedBroker(persistedBroker ?? null);
    setIsBrokerReady(true);
  }, []);

  const selectBroker = useCallback((broker: Broker) => {
    setSelectedBroker(broker);
    window.sessionStorage.setItem("selected-broker", broker);
  }, []);

  const clearBroker = useCallback(() => {
    setSelectedBroker(null);
    window.sessionStorage.removeItem("selected-broker");
  }, []);

  const value = useMemo(
    () => ({
      selectedBroker,
      isBrokerReady,
      selectBroker,
      clearBroker,
    }),
    [clearBroker, isBrokerReady, selectBroker, selectedBroker],
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
