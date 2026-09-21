import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { hasCRMAccess } from "../lib/crm-access";
import { WorkspaceGate } from "./workspace-gate";
import { AppShell } from "./app-shell";

export async function PrivateRouteLayout({ children }: { children: ReactNode }) {
  if (!(await hasCRMAccess())) {
    redirect("/login");
  }

  return (
    <AppShell><WorkspaceGate>{children}</WorkspaceGate></AppShell>
  );
}
