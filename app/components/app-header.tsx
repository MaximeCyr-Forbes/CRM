"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useBroker } from "../broker-context";
import { appNavigationOrder, softwareLinks } from "../data/software-links";
import { GlobalSearch } from "./global-search";

const links = [
  { label: "Accueil", href: "/dashboard", match: "/dashboard" },
  { label: "Contacts", href: "/contacts", match: "/contacts" },
  { label: "Listings", href: "/listings", match: "/listings" },
  { label: "Transactions", href: "/transactions", match: "/transactions" },
  { label: "Calendrier", href: "/calendar", match: "/calendar" },
  { label: "Statistiques", href: "/statistics", match: "/statistics" },
  { label: "Courriels Auto", href: "/automatic-emails", match: "/automatic-emails" },
  { label: "Paramètres", href: "/settings", match: "/settings" },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { selectedBroker, clearBroker } = useBroker();
  const headerRef = useRef<HTMLElement>(null);
  const softwareButtonRef = useRef<HTMLButtonElement>(null);
  const softwareMenuRef = useRef<HTMLDivElement>(null);
  const [isSoftwareOpen, setIsSoftwareOpen] = useState(false);
  const [softwareMenuLeft, setSoftwareMenuLeft] = useState(12);

  function positionSoftwareMenu() {
    const header = headerRef.current;
    const button = softwareButtonRef.current;
    if (!header || !button) return;
    const headerRect = header.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const menuWidth = Math.min(320, window.innerWidth - 24);
    const maximumLeft = Math.max(12, headerRect.width - menuWidth - 12);
    setSoftwareMenuLeft(Math.min(Math.max(12, buttonRect.left - headerRect.left), maximumLeft));
  }

  useEffect(() => {
    if (!isSoftwareOpen) return;
    positionSoftwareMenu();

    function closeOnOutsideClick(event: PointerEvent) {
      const target = event.target as Node;
      if (softwareButtonRef.current?.contains(target) || softwareMenuRef.current?.contains(target)) return;
      setIsSoftwareOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsSoftwareOpen(false);
      softwareButtonRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", positionSoftwareMenu);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", positionSoftwareMenu);
    };
  }, [isSoftwareOpen]);

  function navigate(href: string) {
    router.push(href === "/dashboard" && !selectedBroker ? "/" : href);
  }

  function changeBroker() {
    clearBroker();
    router.push("/");
  }

  return (
    <header className="app-header" ref={headerRef}>
      <button aria-label="Accueil — Équipe Forbes" className="app-header-brand" onClick={() => navigate("/dashboard")} type="button">
        <img
          alt="Équipe Forbes Team"
          className="app-header-brand-logo"
          height="182"
          src="/branding/equipe-forbes-header-logo.png"
          width="1337"
        />
      </button>
      <nav className="app-header-links" aria-label="Navigation principale">
        {appNavigationOrder.map((label) => {
          if (label === "Logiciels") {
            return (
              <button
                aria-controls="software-menu"
                aria-expanded={isSoftwareOpen}
                aria-haspopup="menu"
                key={label}
                onClick={() => {
                  if (!isSoftwareOpen) positionSoftwareMenu();
                  setIsSoftwareOpen((current) => !current);
                }}
                ref={softwareButtonRef}
                type="button"
              >
                Logiciels
              </button>
            );
          }
          const link = links.find((item) => item.label === label);
          if (!link) return null;
          return (
            <button
              aria-current={pathname.startsWith(link.match) ? "page" : undefined}
              key={link.href}
              onClick={() => navigate(link.href)}
              type="button"
            >
              {link.label}
            </button>
          );
        })}
      </nav>
      <div className="app-header-tools">
        <GlobalSearch />
        <div className="app-broker-state">
          <span>Courtier consulté</span>
          <strong>{selectedBroker?.toUpperCase() ?? "AUCUN"}</strong>
        </div>
        <button className="app-change-broker" onClick={changeBroker} type="button">Changer</button>
      </div>
      {isSoftwareOpen && (
        <div
          aria-label="Logiciels de l’Équipe Forbes"
          className="app-software-menu"
          id="software-menu"
          ref={softwareMenuRef}
          role="menu"
          style={{ left: softwareMenuLeft }}
        >
          <p>LOGICIELS</p>
          {softwareLinks.map((software) => (
            <a
              href={software.href}
              key={software.href}
              onClick={() => setIsSoftwareOpen(false)}
              rel="noopener noreferrer"
              role="menuitem"
              target="_blank"
            >
              <span><strong>{software.label}</strong><small>{software.description}</small></span>
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
