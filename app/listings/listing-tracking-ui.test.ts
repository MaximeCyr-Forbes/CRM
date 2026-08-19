import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("interface et sécurité du suivi Listings", () => {
  const detail = source("app/listings/[listingId]/page.tsx");
  const tracking = source("app/components/listing-tracking.tsx");
  const visitModal = source("app/components/listing-visit-modal.tsx");
  const hook = source("app/lib/listings/use-listing-tracking.ts");
  const route = source("app/api/listings/[listingId]/tracking/route.ts");
  const inventory = source("app/listings/page.tsx");
  const listingsContext = source("app/listings-context.tsx");

  it("charge le tracking seulement depuis la fiche détaillée", () => {
    expect(detail).toContain("<ListingTracking listingId={listing.id} />");
    expect(hook).toContain("/tracking");
    expect(inventory).not.toContain("/tracking");
    expect(listingsContext).not.toContain("/tracking");
  });

  it("protège lecture et écritures avec accès CRM, same-origin et service serveur", () => {
    expect(route.match(/requireApiAccess\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(route).toContain("isSameOriginRequest(request)");
    expect(route).not.toContain("getSupabaseAdmin");
    expect(hook).not.toContain("getSupabaseAdmin");
    expect(hook).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("affiche checklist, progression, attribution et tâches personnalisées", () => {
    expect(tracking).toContain("MISE EN MARCHÉ");
    expect(tracking).toContain("listing-checklist-progress");
    expect(tracking).toContain("Complétée");
    expect(tracking).toContain("+ Ajouter une tâche");
    expect(tracking).toContain("updateTask");
    expect(tracking).toContain("deleteTask");
  });

  it("gère visite date seule ou complète, feedback, intérêts et confirmation de suppression", () => {
    for (const label of ["Date *", "Heure", "Courtier visiteur", "Agence", "Acheteurs / visiteurs", "Niveau d’intérêt", "Commentaires / feedback"]) expect(visitModal).toContain(label);
    expect(tracking).toContain("SUPPRIMER CETTE VISITE ?");
    expect(tracking).toContain("LISTING_INTEREST_LABELS");
    expect(tracking).toContain("updateVisit");
    expect(tracking).toContain("deleteVisit");
  });

  it("affiche résumé des visites, historique prix/loyer et timeline automatique", () => {
    expect(tracking).toContain("visitSummary");
    expect(tracking).toContain("HISTORIQUE DE PRIX");
    expect(tracking).toContain('entry.purpose === "rental" ? " / mois"');
    expect(tracking).toContain("ACTIVITÉ");
    expect(tracking).toContain("listing-activity-list");
  });

  it("ne crée ni offres, ni conversion Transaction, ni synchronisation Google Agenda", () => {
    expect(tracking).not.toContain("OFFRES");
    expect(tracking).not.toContain("Créer une transaction");
    expect(route).not.toContain("GOOGLE_");
    expect(route).not.toContain("google-calendar/sync");
  });
});
