import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrokerProvider } from "./broker-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Équipe Forbes | CRM",
  description: "Espace CRM privé de l’Équipe Forbes.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <BrokerProvider>{children}</BrokerProvider>
      </body>
    </html>
  );
}
