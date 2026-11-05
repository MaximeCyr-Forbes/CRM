"use client";

import { useId, useRef, useState } from "react";
import { appNavigationOrder, softwareLinks } from "../data/software-links";
import { ShellIcon } from "./shell-icons";

export const shellLinks = [
  { label: "Accueil", href: "/dashboard" },
  { label: "Contacts", href: "/contacts" },
  { label: "Listings", href: "/listings" },
  { label: "Transactions", href: "/transactions" },
  { label: "Réf. hypothécaires", href: "/mortgage-referrals" },
  { label: "Calendrier", href: "/calendar" },
  { label: "Drive", href: "/drive" },
  { label: "Statistiques", href: "/statistics" },
  { label: "Comptabilité", href: "/accounting" },
  { label: "Pancartes / BAC", href: "/sign-inventory" },
  { label: "Courriels Auto", href: "/automatic-emails" },
  { label: "Paramètres", href: "/settings" },
] as const;

export function AppSidebar({ pathname, workspaceUser, selectedBroker, navigate, onClose }: {
  pathname: string; workspaceUser: string | null; selectedBroker: string | null;
  navigate: (href: string) => void; onClose?: () => void;
}) {
  const [softwareOpen, setSoftwareOpen] = useState(false);
  const softwareId = useId();
  const softwareButton = useRef<HTMLButtonElement>(null);
  const isAssistant = workspaceUser === "immoplus";
  return <>
    <div className="crm-sidebar-brand">
      <button aria-label="Accueil — Équipe Forbes" onClick={() => navigate("/dashboard")} type="button">
        <img alt="Équipe Forbes Team" src="/branding/equipe-forbes-header-logo.png" width="1337" height="182" />
        <span>Espace de travail</span>
      </button>
      {onClose && <button aria-label="Fermer la navigation" className="crm-icon-button" onClick={onClose} type="button"><ShellIcon name="close" /></button>}
    </div>
    <nav aria-label="Navigation principale" className="crm-sidebar-nav">
      <p className="crm-nav-caption">VOTRE ESPACE</p>
      {appNavigationOrder.map(label => {
        if (label === "Logiciels") return <div className="crm-software" key={label} onKeyDown={event => {
          if (event.key === "Escape" && softwareOpen) {
            event.stopPropagation(); event.preventDefault(); setSoftwareOpen(false); softwareButton.current?.focus();
          }
        }}>
          <button aria-expanded={softwareOpen} aria-controls={softwareId} className="crm-nav-item" ref={softwareButton} onClick={() => setSoftwareOpen(open => !open)} type="button">
            <ShellIcon name={label} /><span>{label}</span><span aria-hidden="true" className="crm-nav-chevron">{softwareOpen ? "−" : "+"}</span>
          </button>
          {softwareOpen && <div className="crm-software-links" id={softwareId}>
            {softwareLinks.map(software => <a key={software.href} href={software.href} aria-current={pathname.startsWith(software.href) ? "page" : undefined} onClick={event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); setSoftwareOpen(false); navigate(software.href); onClose?.(); }}>
              <span>{software.label}</span><span aria-hidden="true">→</span>
            </a>)}
          </div>}
        </div>;
        const link = shellLinks.find(item => item.label === label);
        if (!link) return null;
        return <button aria-current={pathname.startsWith(link.href) ? "page" : undefined} className="crm-nav-item" key={link.href} onClick={() => navigate(link.href)} type="button">
          <ShellIcon name={label === "Pancartes / BAC" ? "inventory" : label} /><span>{label}</span>
        </button>;
      })}
    </nav>
    <div className="crm-sidebar-identity">
      <span className="crm-avatar" aria-hidden="true">{isAssistant ? "I" : selectedBroker?.slice(0, 1)}</span>
      <div><strong>{isAssistant ? "IMMOPLUS" : selectedBroker}</strong><span>{isAssistant ? `Adjointe · ${selectedBroker ?? "Courtier à choisir"}` : "Courtier immobilier"}</span></div>
    </div>
  </>;
}
