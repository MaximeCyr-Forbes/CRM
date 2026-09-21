"use client";

import { usePathname, useRouter } from "next/navigation";
import type { RefObject } from "react";
import { BROKERS, type Broker, useBroker } from "../broker-context";
import { GlobalSearch } from "./global-search";
import { AccountMenu } from "./account-menu";
import { ShellIcon } from "./shell-icons";

export function AppTopbar({ onOpenMenu, menuOpen, menuButtonRef }: {
  onOpenMenu: () => void; menuOpen: boolean; menuButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const { workspaceUser, selectedBroker, selectBroker, clearBroker } = useBroker();
  const pathname = usePathname();
  const router = useRouter();
  const isAssistant = workspaceUser === "immoplus";
  return <header className="crm-topbar">
    <button aria-label="Ouvrir la navigation" aria-expanded={menuOpen} aria-controls="crm-navigation-drawer" className="crm-icon-button crm-menu-toggle" onClick={onOpenMenu} ref={menuButtonRef} type="button"><ShellIcon name="menu" /></button>
    <GlobalSearch />
    <div className="crm-topbar-tools">
      <div className="crm-workspace-identity"><strong>{isAssistant ? "IMMOPLUS" : selectedBroker}</strong><span>{isAssistant ? "Adjointe" : "Courtier immobilier"}</span></div>
      {isAssistant && <label className="crm-working-broker"><span>Courtier de travail</span><select aria-label="Courtier de travail" value={selectedBroker ?? ""} onChange={event => { selectBroker(event.target.value as Broker); router.replace(pathname); }}>
        <option value="" disabled>Choisir</option>{BROKERS.map(broker => <option key={broker} value={broker}>{broker.toUpperCase()}</option>)}
      </select></label>}
      <button className="crm-change-user" onClick={() => { clearBroker(); router.push(pathname === "/mortgage-referrals" ? "/?returnTo=%2Fmortgage-referrals" : "/"); }} type="button">{isAssistant ? "Changer d’utilisateur" : "Changer"}</button>
      <AccountMenu />
    </div>
  </header>;
}
