"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useBroker } from "../broker-context";

export default function Dashboard() {
  const router = useRouter();
  const { selectedBroker, clearBroker } = useBroker();

  useEffect(() => {
    if (!selectedBroker) {
      router.replace("/");
    }
  }, [router, selectedBroker]);

  function changeBroker() {
    clearBroker();
    router.push("/");
  }

  if (!selectedBroker) {
    return null;
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-card">
        <span className="dashboard-mark" aria-hidden="true">EF</span>
        <p className="eyebrow">Équipe Forbes · CRM</p>
        <h1>Bonjour {selectedBroker}</h1>
        <button className="change-broker" onClick={changeBroker} type="button">
          Changer de courtier
        </button>
      </div>
    </main>
  );
}
