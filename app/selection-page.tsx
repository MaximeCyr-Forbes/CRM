"use client";

import { useRouter } from "next/navigation";
import { BROKERS, type Broker, useBroker } from "./broker-context";

export function SelectionPage() {
  const router = useRouter();
  const { selectBroker } = useBroker();

  function handleBrokerSelection(broker: Broker) {
    selectBroker(broker);
    router.push("/dashboard");
  }

  return (
    <main className="selection-page">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <section className="selection-shell" aria-labelledby="page-title">
        <header className="brand-lockup">
          <span className="eyebrow">Immobilier</span>
          <h1 id="page-title"><span>ÉQUIPE FORBES</span><strong>CRM</strong></h1>
          <p>Sélectionnez l’espace à consulter.</p>
        </header>
        <div className="broker-grid" aria-label="Choisir un courtier">
          {BROKERS.map((broker, index) => (
            <button className="broker-card" key={broker} onClick={() => handleBrokerSelection(broker)} type="button">
              <span className="card-index">0{index + 1}</span>
              <span className="card-name">{broker.toUpperCase()}</span>
              <span className="card-action" aria-hidden="true">Entrer <span>→</span></span>
            </button>
          ))}
        </div>
      </section>
      <footer className="site-footer">ÉQUIPE FORBES · ESPACE INTERNE</footer>
    </main>
  );
}
