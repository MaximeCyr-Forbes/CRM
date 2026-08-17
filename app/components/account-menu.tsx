"use client";

import { useState } from "react";
import { useAuth } from "../auth-context";
import { useBroker } from "../broker-context";

export function AccountMenu() {
  const { signOut } = useAuth();
  const { clearBroker } = useBroker();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function logout() {
    setIsSigningOut(true);
    try {
      await signOut();
      clearBroker();
      window.location.replace("/login");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="account-menu">
      <button aria-expanded={isOpen} aria-label="Menu d’accès équipe" className="account-menu-trigger" onClick={() => setIsOpen((current) => !current)} type="button">
        <strong>Accès équipe</strong><span aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div className="account-menu-panel">
          <button disabled={isSigningOut} onClick={() => void logout()} type="button">
            {isSigningOut ? "DÉCONNEXION…" : "DÉCONNEXION"}
          </button>
        </div>
      )}
    </div>
  );
}
