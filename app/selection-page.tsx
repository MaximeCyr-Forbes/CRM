"use client";

import { useRouter } from "next/navigation";
import { BROKERS, type Broker, useBroker } from "./broker-context";
import { WORKSPACE_USERS, type WorkspaceUser } from "./lib/workspace";

export function SelectionPage() {
  const router = useRouter();
  const { selectBroker, selectWorkspace, workspaceUser, workingBroker } = useBroker();
  const choosingBroker = workspaceUser === "immoplus" && !workingBroker;
  function handleWorkspaceSelection(user: WorkspaceUser) {
    selectWorkspace(user);
    if (user !== "immoplus") {
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      router.push(returnTo === "/mortgage-referrals" ? "/mortgage-referrals" : "/dashboard");
    }
  }

  function handleBrokerSelection(broker: Broker) {
    selectBroker(broker);
    const returnTo = new URLSearchParams(window.location.search).get("returnTo");
    router.push(returnTo === "/mortgage-referrals" ? "/mortgage-referrals" : "/dashboard");
  }

  return (
    <main className="selection-page">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <section className="selection-shell" aria-labelledby="page-title">
        <header className="brand-lockup">
          <span className="eyebrow">Immobilier</span>
          <h1 id="page-title">
            <img
              alt="Équipe Forbes Team"
              className="selection-brand-logo"
              height="182"
              src="/branding/equipe-forbes-logo.png"
              width="1337"
            />
            <strong>CRM</strong>
          </h1>
          <p>{choosingBroker ? "POUR QUEL COURTIER TRAVAILLEZ-VOUS ?" : "Sélectionnez l’espace à consulter."}</p>
        </header>
        <div className="broker-grid" aria-label={choosingBroker ? "Choisir un courtier de travail" : "Choisir un utilisateur"}>
          {(choosingBroker ? BROKERS : WORKSPACE_USERS).map((broker, index) => (
            <button className="broker-card" key={broker} onClick={() => choosingBroker ? handleBrokerSelection(broker as Broker) : handleWorkspaceSelection(broker as WorkspaceUser)} type="button">
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
