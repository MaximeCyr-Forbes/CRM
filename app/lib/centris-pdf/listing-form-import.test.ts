import { describe, expect, it } from "vitest";
import type { ListingDraft } from "../../data/listing-types";
import { emptyListingDraft } from "../listings/editor";
import { parseCentrisText } from "./parse";
import { syntheticCentrisFixtures as fixtures } from "./synthetic-fixtures";
import {
  applyCentrisListingImport,
  buildCentrisListingGeneralNotes,
  buildCentrisListingImportPreview,
  defaultCentrisListingImportSelection,
  type CentrisListingImportSelection,
} from "./listing-form-import";

const parse = (fixture: (typeof fixtures)[keyof typeof fixtures]) => parseCentrisText(fixture, "fixture-listing.pdf");

function draft(values: Partial<ListingDraft> = {}): ListingDraft {
  return { ...emptyListingDraft("maxime"), ...values };
}

const allSelected: CentrisListingImportSelection = {
  address: true,
  centrisNumber: true,
  propertyType: true,
  purpose: true,
  price: true,
  status: true,
  generalNotes: true,
};

describe("adaptateur Centris vers un nouveau Listing", () => {
  it("importe le suffixe civique 64Z dans le bon champ du Listing", () => {
    const next = applyCentrisListingImport(draft(), parse(fixtures.civicSuffix), allSelected);
    expect(next).toMatchObject({
      civicNumber: "64Z",
      address: "Rue Adélard",
      city: "Saint-Eustache",
      province: "QC",
      postalCode: "J7P 5J6",
    });
  });

  it("importe Ch. Legault sans laisser Près de contaminer le Listing", () => {
    const next = applyCentrisListingImport(draft(), parse(fixtures.saintSauveur), allSelected);
    expect(next).toMatchObject({
      civicNumber: "146",
      address: "Ch. Legault",
      city: "Saint-Sauveur",
      province: "QC",
      postalCode: "J0R 1R7",
    });
    expect(JSON.stringify(next)).not.toMatch(/Sinclair|Près de/i);
  });

  it("mappe le terrain en vente avec adresse structurée, numéro Centris et prix", () => {
    const result = parse(fixtures.land);
    const next = applyCentrisListingImport(draft({ country: "" }), result, allSelected);
    expect(next).toMatchObject({
      civicNumber: result.address.civicNumber,
      address: result.address.street || result.address.fullAddress,
      apartment: result.address.unit,
      city: result.address.city,
      province: result.address.province,
      postalCode: result.address.postalCode,
      country: "Canada",
      centrisNumber: "91000002",
      propertyType: "land",
      purpose: "sale",
      askingPrice: 325000,
      status: "active",
    });
  });

  it("mappe le triplex et conserve unités, loyers et revenus dans les notes", () => {
    const result = parse(fixtures.incomeProperty);
    const next = applyCentrisListingImport(draft(), result, allSelected);
    expect(next.propertyType).toBe("income_property");
    expect(next.askingPrice).toBe(1100000);
    expect(next.generalNotes).toContain("Nombre d’unités : 3");
    expect(next.generalNotes).toContain("UNITÉS LOCATIVES");
    expect(next.generalNotes).toContain("Revenus bruts potentiels");
    expect(next.generalNotes).toContain("Revenus nets d’exploitation");
  });

  it("mappe une location commerciale mensuelle vers monthlyRent", () => {
    const next = applyCentrisListingImport(draft({ askingPrice: 999000 }), parse(fixtures.commercialMonthly), allSelected);
    expect(next).toMatchObject({ propertyType: "commercial", purpose: "rental", monthlyRent: 5000, askingPrice: null, status: "active" });
  });

  it("ne convertit jamais un tarif commercial annuel au pied carré en loyer mensuel", () => {
    const result = parse(fixtures.commercialPerSquareFoot);
    const current = draft({ purpose: "rental", monthlyRent: 4321 });
    const preview = buildCentrisListingImportPreview(current, result);
    expect(result.pricing.annualPerSquareFootAmount).toBe(26);
    expect(preview.find((item) => item.field === "price")).toMatchObject({ available: false });
    expect(defaultCentrisListingImportSelection(current, result).price).toBe(false);
    expect(applyCentrisListingImport(current, result, allSelected).monthlyRent).toBe(4321);
  });

  it("mappe une vente commerciale sans ajouter les taxes au prix", () => {
    const result = parse(fixtures.commercialSale);
    const next = applyCentrisListingImport(draft(), result, allSelected);
    expect(next).toMatchObject({ propertyType: "commercial", purpose: "sale", askingPrice: 2500000 });
    expect(result.pricing.taxesApplicable).toBe(true);
    expect(next.generalNotes).toContain("TPS/TVQ applicables");
  });

  it("crée une fiche historique cohérente pour un condo vendu", () => {
    const next = applyCentrisListingImport(draft(), parse(fixtures.soldWithPromiseDate), allSelected);
    expect(next).toMatchObject({ propertyType: "condo", purpose: "sale", status: "sold", askingPrice: 527000 });
  });

  it("propose active pour un condo actuellement en marché", () => {
    const next = applyCentrisListingImport(draft(), parse(fixtures.condo), allSelected);
    expect(next).toMatchObject({ propertyType: "condo", purpose: "sale", status: "active", askingPrice: 499000 });
  });

  it("mappe une location résidentielle vers le loyer mensuel", () => {
    const next = applyCentrisListingImport(draft(), parse(fixtures.residentialRental), allSelected);
    expect(next).toMatchObject({ propertyType: "residential", purpose: "rental", monthlyRent: 6500, status: "active" });
  });

  it("crée une fiche historique cohérente pour une propriété louée", () => {
    const result = parse(fixtures.residentialRental);
    result.centrisMarketStatus = "rented";
    result.centrisMarketStatusRaw = "Loué";
    result.confidence.centrisMarketStatus = "high";
    const next = applyCentrisListingImport(draft(), result, allSelected);
    expect(next).toMatchObject({ purpose: "rental", status: "rented", monthlyRent: 6500 });
  });

  it("rend l’intergénération et son revenu supplémentaire dans les notes", () => {
    const result = parse(fixtures.intergenerational);
    const notes = buildCentrisListingGeneralNotes(result);
    expect(result.property.intergenerational).toBe(true);
    expect(notes).toContain("Intergénération : Oui");
    expect(notes).toContain("Revenu supplémentaire");
  });

  it("préserve strictement courtier, propriétaires, dates, liens et image", () => {
    const current = draft({
      broker: "france",
      ownerContactIds: ["owner-a", "owner-b"],
      listingDate: "2026-08-01",
      expirationDate: "2027-01-31",
      centrisUrl: "https://example.test/centris",
      publicUrl: "https://example.test/public",
      primaryImageUrl: "https://example.test/photo.jpg",
    });
    const next = applyCentrisListingImport(current, parse(fixtures.soldWithPromiseDate), allSelected);
    expect(next).toMatchObject({
      broker: "france",
      ownerContactIds: ["owner-a", "owner-b"],
      listingDate: "2026-08-01",
      expirationDate: "2027-01-31",
      centrisUrl: "https://example.test/centris",
      publicUrl: "https://example.test/public",
      primaryImageUrl: "https://example.test/photo.jpg",
    });
  });

  it("détecte les conflits et ne coche pas les valeurs différentes par défaut", () => {
    const result = parse(fixtures.condo);
    const current = draft({ centrisNumber: "11111111", askingPrice: 500000, propertyType: "land" });
    const preview = buildCentrisListingImportPreview(current, result);
    const selection = defaultCentrisListingImportSelection(current, result);
    expect(preview.find((item) => item.field === "price")?.hasConflict).toBe(true);
    expect(preview.find((item) => item.field === "centrisNumber")?.hasConflict).toBe(true);
    expect(selection).toMatchObject({ centrisNumber: false, propertyType: false, price: false });
  });

  it("coche un champ vide fiable et décoche toute confiance faible", () => {
    const result = parse(fixtures.condo);
    expect(defaultCentrisListingImportSelection(draft(), result).centrisNumber).toBe(true);
    result.confidence.centrisNumber = "low";
    expect(defaultCentrisListingImportSelection(draft(), result).centrisNumber).toBe(false);
  });

  it("ne duplique jamais les notes lorsque le même PDF est appliqué deux fois", () => {
    const result = parse(fixtures.condo);
    const once = applyCentrisListingImport(draft(), result, allSelected);
    const twice = applyCentrisListingImport(once, result, allSelected);
    expect(twice.generalNotes).toBe(once.generalNotes);
    expect(twice.generalNotes.match(/FICHE CENTRIS IMPORTÉE/g)).toHaveLength(1);
  });
});
