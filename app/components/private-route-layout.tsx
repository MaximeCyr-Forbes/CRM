import { headers } from 'next/headers';
import { safeReturnPath } from '../lib/auth/identity';
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { hasCRMAccess } from "../lib/crm-access";
import { WorkspaceGate } from "./workspace-gate";
import { AppShell } from "./app-shell";

export async function PrivateRouteLayout({ children }: { children: ReactNode }) {
  if (!(await hasCRMAccess())) {
    const returnTo = safeReturnPath((await headers()).get("x-crm-return-path"));
    if (returnTo === "/") redirect("/login");
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return (
    <AppShell><WorkspaceGate>{children}</WorkspaceGate></AppShell>
  );
}
