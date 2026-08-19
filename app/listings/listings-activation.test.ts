import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("activation visuelle Listings", () => {
  it("monte ListingsProvider après les Providers CRM existants", () => {
    const layout = source("app/layout.tsx");
    expect(layout).toContain("<ListingsProvider>{children}</ListingsProvider>");
    expect(layout.indexOf("<AuthProvider>")).toBeLessThan(layout.indexOf("<BrokerProvider>"));
    expect(layout.indexOf("<BrokerProvider>")).toBeLessThan(layout.indexOf("<CRMDataProvider>"));
    expect(layout.indexOf("<CRMDataProvider>")).toBeLessThan(layout.indexOf("<TransactionsProvider>"));
    expect(layout.indexOf("<TransactionsProvider>")).toBeLessThan(layout.indexOf("<ListingsProvider>"));
  });

  it("ajoute la route privée et la page Listings sans fiche détaillée", () => {
    expect(existsSync(resolve(root, "app/listings/page.tsx"))).toBe(true);
    expect(source("app/listings/layout.tsx")).toContain("PrivateRouteLayout");
    expect(existsSync(resolve(root, "app/listings/[listingId]/page.tsx"))).toBe(false);
    expect(source("app/listings/page.tsx")).not.toContain("Nouveau Listing");
  });

  it("affiche un placeholder d’image et distingue chargement, erreur et état vide", () => {
    const page = source("app/listings/page.tsx");
    expect(page).toContain("listing-card-placeholder");
    expect(page).toContain("onError={() => setHasImageError(true)}");
    expect(page).toContain("Listings temporairement indisponibles.");
    expect(page).toContain("retry()");
    expect(page).toContain("Chargement de l’inventaire…");
    expect(page).toContain("AUCUN LISTING ACTIF");
    expect(page).toContain("AUCUN LISTING TROUVÉ");
  });

  it("conserve les filtres dans une URL partageable", () => {
    const page = source("app/listings/page.tsx");
    expect(page).toContain("new URLSearchParams(searchParams.toString())");
    expect(page).toContain("router.push(query ? `/listings?${query}` : \"/listings\")");
    expect(page).toContain('searchParams.get("broker")');
    expect(page).toContain('searchParams.get("status")');
    expect(page).toContain('searchParams.get("purpose")');
  });

  it("remplace seulement la carte Vendeurs par Listings actifs sur le dashboard", () => {
    const dashboard = source("app/dashboard/page.tsx");
    expect(dashboard).toContain('label: "Listings actifs"');
    expect(dashboard).toContain('listing.broker === brokerKey && listing.status === "active"');
    expect(dashboard).toContain("`/listings?broker=${brokerKey}&status=active`");
    expect(dashboard).not.toContain('label: "Vendeurs actifs"');
    expect(dashboard).toContain('label: "Acheteurs actifs"');
    expect(dashboard).toContain('label: "Transactions actives"');
  });

  it("n’ajoute aucune migration Supabase à l’étape 3", () => {
    const listingsMigrations = readdirSync(resolve(root, "supabase/migrations"))
      .filter((name) => name.includes("listing"));
    expect(listingsMigrations).toEqual(["20260819210000_create_listings_foundation.sql"]);
  });
});
