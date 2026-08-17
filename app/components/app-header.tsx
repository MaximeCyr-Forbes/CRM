"use client";

import { usePathname, useRouter } from "next/navigation";
import { useBroker } from "../broker-context";
import { GlobalSearch } from "./global-search";

const links = [
  { label: "Accueil", href: "/dashboard", match: "/dashboard" },
  { label: "Contacts", href: "/contacts", match: "/contacts" },
  { label: "Pipeline", href: "/pipeline", match: "/pipeline" },
  { label: "Transactions", href: "/transactions", match: "/transactions" },
  { label: "Paramètres", href: "/settings", match: "/settings" },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { selectedBroker, clearBroker } = useBroker();

  function navigate(href: string) {
    router.push(href === "/dashboard" && !selectedBroker ? "/" : href);
  }

  function changeBroker() {
    clearBroker();
    router.push("/");
  }

  return (
    <header className="app-header">
      <button aria-label="Accueil — Équipe Forbes" className="app-header-brand" onClick={() => navigate("/dashboard")} type="button">
        <span aria-hidden="true">EF</span><strong>Équipe Forbes</strong>
      </button>
      <nav className="app-header-links" aria-label="Navigation principale">
        {links.map((link) => (
          <button
            aria-current={pathname.startsWith(link.match) ? "page" : undefined}
            key={link.href}
            onClick={() => navigate(link.href)}
            type="button"
          >
            {link.label}
          </button>
        ))}
      </nav>
      <div className="app-header-tools">
        <GlobalSearch />
        <div className="app-broker-state">
          <span>Courtier consulté</span>
          <strong>{selectedBroker?.toUpperCase() ?? "AUCUN"}</strong>
        </div>
        <button className="app-change-broker" onClick={changeBroker} type="button">Changer</button>
      </div>
    </header>
  );
}
