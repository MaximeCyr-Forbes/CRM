import type { Metadata, Viewport } from "next";
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
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Forbes CRM",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#13233b",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <head>
        <meta content="yes" name="apple-mobile-web-app-capable" />
        <meta content="width=device-width, initial-scale=1, viewport-fit=cover" name="viewport" />
      </head>
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
