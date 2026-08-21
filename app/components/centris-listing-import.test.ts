import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("import Centris dans + Nouveau Listing", () => {
  const component = source("app/components/centris-listing-import.tsx");
  const modal = source("app/components/listing-editor-modal.tsx");
  const page = source("app/listings/page.tsx");
  const transactionImport = source("app/components/centris-transaction-import.tsx");
  const apiResponse = source("app/lib/listings/api-response.ts");
  const styles = source("app/globals.css");

  it("réutilise l’unique route et ne duplique aucune dépendance du parseur", () => {
    expect(component).toContain('fetch("/api/centris/parse"');
    expect(component).not.toContain("pdfjs-dist");
    expect(component).not.toContain("parseCentrisText");
    expect(component).not.toContain("extractPDFText");
  });

  it("place le dépôt PDF uniquement en création, avant le type de mandat", () => {
    expect(modal).toContain('mode === "create" && <CentrisListingImport');
    expect(modal.indexOf("<CentrisListingImport")).toBeLessThan(modal.indexOf("Type de mandat"));
    expect(modal).not.toContain('mode === "edit" && <CentrisListingImport');
    expect(component).toContain("DÉPOSER UNE FICHE CENTRIS");
  });

  it("applique le draft et synchronise les deux états de prix séparés", () => {
    expect(modal).toContain("setValues(nextValues)");
    expect(modal).toContain("setAskingPrice(nextValues.askingPrice");
    expect(modal).toContain("setMonthlyRent(nextValues.monthlyRent");
    expect(modal).toContain("Tarif détecté");
    expect(component).toContain("TARIF COMMERCIAL DÉTECTÉ");
    expect(component).toContain("montant mensuel");
  });

  it("bloque le doublon et permet seulement d’annuler ou d’ouvrir l’existant", () => {
    expect(modal).toContain("findListingWithCentrisNumber");
    expect(modal).toContain("LISTING DÉJÀ EXISTANT");
    expect(modal).toContain("Ouvrir le Listing existant");
    expect(modal).not.toContain("CRÉER QUAND MÊME");
    expect(page).toContain("listings={listings}");
    expect(page).toContain("openListing(listingId)");
    expect(apiResponse).toContain("Un Listing avec ce numéro Centris existe déjà.");
  });

  it("protège la soumission synchrone contre le double clic et expose l’état occupé", () => {
    expect(modal).toContain("submittingRef.current || isSaving");
    expect(modal).toContain("acquireListingSubmissionLock(submittingRef)");
    expect(modal).toContain("releaseListingSubmissionLock(submittingRef)");
    expect(modal).toContain('aria-busy={isSaving || isSubmitting}');
    expect(modal).toContain('"Création…"');
  });

  it("préserve l’import Transaction et le responsive existants", () => {
    expect(transactionImport).toContain('fetch("/api/centris/parse"');
    expect(transactionImport).toContain("applyCentrisTransactionImport");
    expect(styles).toContain(".transaction-centris-summary,");
    expect(styles).toContain(".listing-duplicate-warning dl { grid-template-columns: 1fr; }");
  });
});
