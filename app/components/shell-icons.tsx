import type { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  Accueil: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
  Contacts: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-2-4" /></>,
  Listings: <><path d="M4 21V3h11v18M15 9h5v12M2 21h20M8 7h3M8 11h3M8 15h3M8 21v-3h3v3" /></>,
  Transactions: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V3h8v4M3 12a23 23 0 0 0 18 0M10 13h4" /></>,
  "Réf. hypothécaires": <><path d="M3 11h18L12 3ZM5 11v8m7-8v8m7-8v8M3 21h18" /></>,
  Calendrier: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2" /></>,
  Drive: <path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  Statistiques: <><path d="M4 3v18h17M8 17v-4m5 4V9m5 8V5" /></>,
  "Courriels Auto": <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>,
  Logiciels: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  Paramètres: <><path d="M4 7h16M4 17h16" /><circle cx="8" cy="7" r="3" fill="currentColor" /><circle cx="16" cy="17" r="3" fill="currentColor" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
};

export function ShellIcon({ name }: { name: string }) {
  return <svg aria-hidden="true" className="crm-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
