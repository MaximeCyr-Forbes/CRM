"use client";

import { useEffect, useState } from "react";

export type EmailTab = "campaigns" | "automations" | "settings";
const tabs: { id: EmailTab; label: string }[] = [
  { id: "campaigns", label: "Campagnes" },
  { id: "automations", label: "Automatisations" },
  { id: "settings", label: "Paramètres" },
];
export function emailTabFromSearch(search: string): EmailTab {
  const value = new URLSearchParams(search).get("tab");
  return value === "automations" || value === "settings" ? value : "campaigns";
}
export function useEmailTab() {
  const [activeTab, setActiveTab] = useState<EmailTab>("campaigns");
  useEffect(() => {
    const restore = () => setActiveTab(emailTabFromSearch(window.location.search));
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  function selectTab(tab: EmailTab) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    if (url.search !== window.location.search) window.history.pushState(window.history.state, "", url);
    setActiveTab(tab);
  }
  return [activeTab, selectTab] as const;
}
export function EmailTabs({ activeTab, onSelect }: { activeTab: EmailTab; onSelect: (tab: EmailTab) => void }) {
  return <nav className="email-workspace-tabs" aria-label="Sections Courriels">
    {tabs.map(tab => <button key={tab.id} type="button" aria-pressed={activeTab === tab.id} aria-controls={`email-${tab.id}`} onClick={() => onSelect(tab.id)}>{tab.label}</button>)}
  </nav>;
}
