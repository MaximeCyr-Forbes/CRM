import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appNavigationOrder } from "../data/software-links";
import { STATISTICS_YEARS } from "../data/statistics-types";

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
      "Drive",
      "Statistiques",
      "Courriels Auto",
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
    expect(page).toContain('/transactions?type=sale&state=sold&year=${year}');
    expect(page).toContain('/transactions?type=purchase&state=sold&year=${year}');
    expect(page).toContain('/listings?status=active');
    expect(page).toContain('/contacts?broker=unassigned');
    expect(page).toContain('/contacts?followUp=overdue');
  });

  it("expose le sélecteur annuel borné et adapte les contrôles historiques", () => {
    const page = source("app/statistics/page.tsx");
    const styles = source("app/globals.css");
    expect(STATISTICS_YEARS).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]);
    expect(page).toContain('aria-label="Année des statistiques"');
    expect(page).toContain('option.value === "twelve_months" && year !== currentYear');
    expect(page).toContain('min={yearMinimum}');
    expect(page).toContain('max={yearMaximum}');
    expect(page).toContain('Historique d’état non disponible');
    expect(styles).toContain('.statistics-year-filter select { width: 100%; }');
  });
});
