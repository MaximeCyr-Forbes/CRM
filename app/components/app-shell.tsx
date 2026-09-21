"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useBroker } from "../broker-context";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { selectedBroker, workspaceUser } = useBroker();
  const [menuOpen, setMenuOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const selection = pathname === "/" || !selectedBroker;

  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen || selection) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    // Moving from tablet to desktop must not leave a hidden modal trapping focus.
    const desktop = window.matchMedia("(min-width: 1100px)");
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      menuButtonRef.current?.focus();
    };
  }, [menuOpen, selection]);

  if (selection) return <><AppHeader /><div className="private-route-content">{children}</div></>;
  function navigate(href: string) {
    setMenuOpen(false);
    router.push(href === "/dashboard" && !selectedBroker ? "/" : href);
  }
  const sidebarProps = { pathname, workspaceUser, selectedBroker, navigate };
  return <div className="crm-app-shell">
    <a className="crm-skip-link" href="#crm-content">Aller au contenu</a>
    <aside className="crm-sidebar"><AppSidebar {...sidebarProps} /></aside>
    <div className="crm-workspace">
      <AppTopbar onOpenMenu={() => setMenuOpen(true)} menuOpen={menuOpen} menuButtonRef={menuButtonRef} />
      <div className="crm-content private-route-content" id="crm-content" tabIndex={-1}>{children}</div>
    </div>
    <dialog aria-label="Navigation du CRM" className="crm-navigation-drawer" id="crm-navigation-drawer" ref={dialogRef} onCancel={() => setMenuOpen(false)} onClick={event => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
      {menuOpen && <div className="crm-drawer-panel"><AppSidebar {...sidebarProps} onClose={() => setMenuOpen(false)} /></div>}
    </dialog>
  </div>;
}
