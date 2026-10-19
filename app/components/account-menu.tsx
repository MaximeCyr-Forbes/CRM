"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../auth-context";
import { useBroker } from "../broker-context";

export function AccountMenu() {
  const { signOut, member } = useAuth();
  const { clearBroker, selectBroker } = useBroker();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

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
    <div className="account-menu" ref={menuRef}>
      <button aria-expanded={isOpen} aria-label="Menu d’accès équipe" className="account-menu-trigger" onClick={() => setIsOpen((current) => !current)} ref={triggerRef} type="button">
        <strong>Accès équipe</strong><span aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div className="account-menu-panel">
          {member && <><p>Connecté : {member.broker}</p><Link href="/oauth/connections">Applications autorisées</Link></>}
          {member?.role === 'admin' && member.brokers.map(broker => <button key={broker} type="button" onClick={() => { selectBroker(broker === 'maxime' ? 'Maxime' : broker === 'france' ? 'France' : 'Sandrine'); setIsOpen(false); }}>Consulter {broker}</button>)}
          <button disabled={isSigningOut} onClick={() => void logout()} type="button">
            {isSigningOut ? "DÉCONNEXION…" : "DÉCONNEXION"}
          </button>
        </div>
      )}
    </div>
  );
}
