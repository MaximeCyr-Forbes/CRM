import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const report = source("app/listings/[listingId]/report/page.tsx");
const reportService = source("app/lib/listings/report.ts");
const reportRoute = source("app/api/listings/[listingId]/report/route.ts");
const overviewRoute = source("app/api/listings/overview/route.ts");
const overviewService = source("app/lib/listings/overview.ts");
const inventory = source("app/listings/page.tsx");
const detail = source("app/listings/[listingId]/page.tsx");
const css = source("app/globals.css");

describe("rapport vendeur et propriétaire", () => {
  it("adapte le titre à la Vente ou à la Location", () => {
    expect(report).toContain("RAPPORT VENDEUR");
    expect(report).toContain("RAPPORT PROPRIÉTAIRE");
    expect(report).toContain('listing.purpose === "sale"');
  });

  it("présente prix, loyer, propriété, propriétaires et date du rapport", () => {
    for (const text of ["RÉSUMÉ DE LA PROPRIÉTÉ", "Prix actuel", "Loyer actuel", "Propriétaire", "Rapport généré le"]) expect(report).toContain(text);
    expect(report).toContain("listingPriceLabel(listing)");
  });

  it("présente visites, intérêts et feedback sans identité d’acheteur", () => {
    expect(report).toContain("VISITES ET COMMENTAIRES");
    expect(report).toContain("interestCounts.high");
    expect(report).toContain("visit.feedback");
    expect(report).not.toContain("visit.buyerNames");
    expect(report).not.toContain("visitingBrokerName");
  });

  it("présente les offres sans acheteur, courtier, agence ni notes", () => {
    expect(report).toContain("OFFRES REÇUES");
    expect(report).toContain("offer.amount");
    expect(report).toContain("offer.status");
    for (const privateField of ["offer.buyerNames", "offer.collaboratingBrokerName", "offer.collaboratingBrokerAgency", "offer.notes"]) expect(report).not.toContain(privateField);
  });

  it("présente l’évolution Vente et Location ainsi que la différence", () => {
    expect(report).toContain("ÉVOLUTION DU PRIX");
    expect(report).toContain("ÉVOLUTION DU LOYER");
    expect(report).toContain("differencePercent");
    expect(report).toContain("formatListingAmount(entry.amount, entry.purpose)");
  });

  it("sépare les actions réalisées et restantes", () => {
    expect(report).toContain("ACTIONS RÉALISÉES");
    expect(report).toContain("PROCHAINES ACTIONS");
    expect(report).toContain("completedTasks");
    expect(report).toContain("remainingTasks");
  });

  it("n’affiche jamais les notes internes ou l’activité technique", () => {
    expect(report).not.toContain("generalNotes");
    expect(report).not.toContain("tracking.activity");
    expect(reportService).toContain('generalNotes: ""');
    expect(reportService).toContain("activity: []");
  });

  it("gère les sections vides, l’erreur API et le Listing inexistant", () => {
    for (const text of ["Aucune visite enregistrée pour le moment.", "Aucune offre reçue pour le moment.", "Certaines données du rapport sont temporairement indisponibles.", "LISTING INTROUVABLE", "RÉESSAYER"]) expect(report).toContain(text);
  });

  it("permet l’impression PDF navigateur et la copie du résumé", () => {
    expect(report).toContain("window.print()");
    expect(report).toContain("IMPRIMER / ENREGISTRER EN PDF");
    expect(report).toContain("navigator.clipboard.writeText(summary)");
    expect(css).toContain("@media print");
    expect(css).toContain("break-inside: avoid");
    expect(css).toContain(".app-header, .account-menu, .listing-report-toolbar, .listing-report-warning");
  });
});

describe("intégration et performance Listings", () => {
  it("affiche overview, contrats, indicateurs de cartes et filtres existants", () => {
    expect(inventory).toContain("<ListingOverview");
    expect(inventory).toContain("getListingDaysOnMarket(listing)");
    expect(inventory).toContain("getListingExpirationInfo(listing)");
    for (const existing of ["LISTING_STATUS_FILTERS", "LISTING_PURPOSES", "listings-search", "+ Nouveau Listing"]) expect(inventory).toContain(existing);
  });

  it("ajoute le résumé et le bouton de rapport à la fiche", () => {
    expect(detail).toContain("<ListingMarketSnapshot");
    expect(detail).toContain("Rapport vendeur");
    expect(detail).toContain("Rapport propriétaire");
    expect(detail).toContain("/report");
  });

  it("protège les deux endpoints et interdit le cache privé", () => {
    for (const route of [reportRoute, overviewRoute]) {
      expect(route).toContain("requireApiAccess()");
      expect(route).toContain('"Cache-Control": "private, no-store"');
      expect(route).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
  });

  it("charge offres et checklists en batch sans requête par Listing", () => {
    expect(overviewService).toContain("loadOverviewRowsInBatches");
    expect(overviewService).toContain("LISTING_OVERVIEW_BATCH_SIZE = 150");
    expect(overviewService).toContain('.in("listing_id", [...batch])');
    expect(overviewService).not.toMatch(/for\s*\([^)]*listing[^)]*\)[\s\S]*getSupabaseAdmin\(\)/i);
  });

  it("charge le rapport d’un seul Listing et ses relations seulement", () => {
    expect(reportService).toContain("getListing(listingId)");
    expect(reportService).toContain("getListingTracking(listingId)");
    expect(reportService).toContain("listListingOffers(listingId)");
    expect(reportService).not.toContain("listListings(");
  });

  it("ne crée aucune migration Supabase pour l’étape 8", () => {
    expect(overviewService).not.toMatch(/create table|alter table|create or replace function/i);
    expect(reportService).not.toMatch(/create table|alter table|create or replace function/i);
  });
});
