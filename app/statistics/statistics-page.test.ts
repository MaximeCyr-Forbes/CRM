import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appNavigationOrder } from "../data/software-links";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("onglet Statistiques", () => {
  it("est privé et placé exactement entre Calendrier et Logiciels", () => {
    expect(appNavigationOrder).toEqual([
      "Accueil",
      "Contacts",
      "Listings",
      "Transactions",
      "Calendrier",
      "Statistiques",
      "Logiciels",
      "Paramètres",
    ]);
    expect(source("app/components/app-header.tsx")).toContain('{ label: "Statistiques", href: "/statistics", match: "/statistics" }');
    expect(source("app/statistics/layout.tsx")).toContain("PrivateRouteLayout");
  });

  it("offre les filtres, indicateurs et sections métier demandés", () => {
    const page = source("app/statistics/page.tsx");
    expect(page).toContain('value: "custom"');
    expect(page).toContain('value: "team"');
    expect(page).toContain("PERFORMANCE DES LISTINGS");
    expect(page).toContain("PROVENANCE DES CLIENTS");
    expect(page).toContain("ACTIVITÉ PAR COURTIER");
    expect(page).toContain("SANTÉ DES CONTACTS");
    expect(page).toContain("TENDANCES MENSUELLES");
    expect(page).toContain("Les achats et les ventes sans Listing source sont strictement exclus");
  });

  it("relie les indicateurs aux listes déjà filtrables", () => {
    const page = source("app/statistics/page.tsx");
    expect(page).toContain('/transactions?type=sale&state=completed');
    expect(page).toContain('/transactions?type=purchase&state=completed');
    expect(page).toContain('/listings?status=active');
    expect(page).toContain('/contacts?broker=unassigned');
    expect(page).toContain('/contacts?followUp=overdue');
  });
});
