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
      "Transactions", "Réf. hypothécaires",
      "Calendrier",
      "Drive",
      "Statistiques",
  "Comptabilité", "Pancartes / BAC",
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
    expect(page).not.toContain("PERFORMANCE DES LISTINGS");
    expect(page).not.toContain('className="statistics-panel statistics-listing-performance"');
    expect(page).toContain("PROVENANCE DES CLIENTS");
    expect(page).toContain("ACTIVITÉ PAR COURTIER");
    expect(page).toContain("SANTÉ DES CONTACTS");
    expect(page).toContain("TENDANCES MENSUELLES");
    expect(page).toContain('<InteractiveTrends key={requestUrl} snapshot={data} query={requestUrl} />');
    expect(page).not.toContain("Les achats et les ventes sans Listing source sont strictement exclus");
    expect(page).toContain('aria-labelledby="current-month-title"');
    expect(page).not.toContain('PA acceptée');
    expect(page).not.toContain('acceptedOffers');
    expect(page).not.toContain('data.definitions.paDelay');
    expect(page).not.toContain('data.definitions.saleDelay');
    expect(page).toContain('data.definitions.purchaseBusinessDate');
    expect(page).toContain('<summary>Règles de calcul</summary>');
    expect(page).toContain('<summary>Période de comparaison</summary>');
  });

  it("conserve six comparatifs et huit colonnes de courtier alignées sans case réservée", () => {
    const page = source("app/statistics/page.tsx");
    const monthly = page.split('className="statistics-month-grid"')[1].split('</section>')[0];
    for (const field of ['newContacts', 'newListings', 'saleTransactions', 'purchaseTransactions', 'saleVolume', 'purchaseVolume']) expect(monthly).toContain(`data.currentMonth.${field}`);
    expect(monthly.match(/data.currentMonth\./g)).toHaveLength(6);
    const table = page.split('<table className="statistics-table">')[1].split('</table>')[0];
    expect(table.split('</thead>')[0].match(/<th>/g)).toHaveLength(8);
    expect(table.split('<tbody>')[1].match(/<(?:th|td)>/g)).toHaveLength(8);
    for (const field of ['newContacts', 'listingsTaken', 'saleTransactions', 'purchaseTransactions', 'saleVolume', 'purchaseVolume', 'followUps']) expect(table).toContain(`item.${field}`);
  });

  it("retire uniquement la PA des sept KPI restants sans emplacement réservé", () => {
    const page = source("app/statistics/page.tsx");
    const kpis = page.split('const kpis = data ? [')[1].split('] : [];')[0];
    expect(kpis).not.toContain('acceptedOffers');
    expect(kpis).not.toContain('PA acceptées');
    for (const label of ['Nouveaux contacts', 'Nouveaux Listings', 'Transactions de vente', 'Transactions d’achat', 'Volume de vente', 'Volume d’achat', 'Listings actifs']) expect(kpis).toContain(label);
    expect(kpis.match(/label:/g)).toHaveLength(7);
    expect(page).toContain('kpis.map((item) =>');
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
