"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BROKERS, type Broker, useBroker } from "./broker-context";
import { WORKSPACE_USERS, type WorkspaceUser } from "./lib/workspace";

export function SelectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectBroker, selectWorkspace, workspaceUser, isBrokerReady } = useBroker();
  const choosingBroker = searchParams.get("workspace") === "immoplus";
  const returnTo = searchParams.get("returnTo");
  const destination = returnTo === "/mortgage-referrals" ? returnTo : "/dashboard";

  // A direct URL/F5 may arrive without an assistant session. History traversal
  // only reads the URL; it never pushes another entry or erases a saved broker.
  useEffect(() => {
    if (isBrokerReady && choosingBroker && workspaceUser !== "immoplus") {
      selectWorkspace("immoplus");
    }
  }, [choosingBroker, isBrokerReady, selectWorkspace, workspaceUser]);
  function handleWorkspaceSelection(user: WorkspaceUser) {
    selectWorkspace(user);
    if (user === "immoplus") {
      const params = new URLSearchParams({ workspace: "immoplus" });
      if (returnTo === "/mortgage-referrals") params.set("returnTo", returnTo);
      router.push(`/?${params.toString()}`);
    } else {
      router.push(destination);
    }
  }

  function handleBrokerSelection(broker: Broker) {
    selectBroker(broker);
    router.push(destination);
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
            <button className="broker-card" disabled={choosingBroker && workspaceUser !== "immoplus"} key={broker} onClick={() => choosingBroker ? handleBrokerSelection(broker as Broker) : handleWorkspaceSelection(broker as WorkspaceUser)} type="button">
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
