import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "./auth-context";
import { BrokerProvider } from "./broker-context";
import { CRMDataProvider } from "./crm-data-context";
import { ListingsProvider } from "./listings-context";
import { TransactionsProvider } from "./transactions-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Équipe Forbes | CRM",
  description: "Espace CRM privé de l’Équipe Forbes.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>
          <BrokerProvider>
            <CRMDataProvider>
              <TransactionsProvider>
                <ListingsProvider>{children}</ListingsProvider>
              </TransactionsProvider>
            </CRMDataProvider>
          </BrokerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
