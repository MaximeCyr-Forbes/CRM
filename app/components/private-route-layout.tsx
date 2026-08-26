import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { hasCRMAccess } from "../lib/crm-access";
import { AppHeader } from "./app-header";

export async function PrivateRouteLayout({ children }: { children: ReactNode }) {
  if (!(await hasCRMAccess())) {
    redirect("/login");
  }

  return (
    <>
      <AppHeader />
      <div className="private-route-content">{children}</div>
    </>
  );
}
