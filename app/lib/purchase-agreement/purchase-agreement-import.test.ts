import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Listing } from "../../data/listing-types";
import { purchaseAgreementOfferDraft } from "./offer";
import type { PurchaseAgreementParseResult } from "./types";
import { validatePurchaseAgreementPDFUpload } from "./validate-upload";
import { validatePurchaseAgreementForListing } from "./validation";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const listing = {
  id: "listing-fictional",
  civicNumber: "42-44",
  address: "Rue des Erables",
  apartment: "",
  city: "Quebec",
  province: "QC",
  postalCode: "G1A 2B3",
  country: "Canada",
  purpose: "sale",
} as Listing;

const result: PurchaseAgreementParseResult = {
  recognized: true,
  buyers: ["Camille Moreau", "Thomas Girard"],
  sellers: ["Élise Dufour"],
  propertyAddress: {
    fullAddress: "42-44 Rue des Érables, Québec, G1A 2B3, QC",
    civicNumber: "42 - 44",
    street: "rue des érables",
    city: "QUÉBEC",
    province: "QC",
    postalCode: "G1A2B3",
  },
  amount: 625000,
  warnings: [],
};

describe("import d’une Promesse d’achat dans les offres du Listing", () => {
  it("accepte la même adresse malgré les accents, espaces et ponctuation", () => {
    const validation = validatePurchaseAgreementForListing(result, listing, ["ELISE DUFOUR"]);
    expect(validation.addressMatch).toBe(true);
    expect(validation.sellerMatch).toBe(true);
    expect(validation.canImport).toBe(true);
  });

  it("bloque une PA liée à un autre immeuble", () => {
    const validation = validatePurchaseAgreementForListing({
      ...result,
      propertyAddress: { ...result.propertyAddress, civicNumber: "100", fullAddress: "100 Rue Exemple" },
    }, listing, ["Élise Dufour"]);
    expect(validation.addressMatch).toBe(false);
    expect(validation.canImport).toBe(false);
  });

  it("avertit sur le vendeur sans bloquer une adresse fiable", () => {
    const validation = validatePurchaseAgreementForListing(result, listing, ["Nadia Beaulieu"]);
    expect(validation.sellerMatch).toBe(false);
    expect(validation.addressMatch).toBe(true);
    expect(validation.canImport).toBe(true);
  });

  it("construit uniquement l’offre reçue attendue avec la date locale technique", () => {
    expect(purchaseAgreementOfferDraft(result, new Date(2026, 7, 26, 23, 30))).toEqual({
      offerDate: "2026-08-26",
      amount: 625000,
      status: "received",
      buyerNames: "Camille Moreau, Thomas Girard",
      collaboratingBrokerName: "",
      collaboratingBrokerAgency: "",
      notes: "",
    });
  });

  it("valide un seul PDF non vide de 20 Mo maximum", () => {
    expect(validatePurchaseAgreementPDFUpload({ name: "pa.pdf", type: "application/pdf", size: 100 })).toEqual({ valid: true });
    expect(validatePurchaseAgreementPDFUpload({ name: "pa.jpg", type: "image/jpeg", size: 100 })).toMatchObject({ valid: false, status: 415 });
    expect(validatePurchaseAgreementPDFUpload({ name: "pa.pdf", type: "application/pdf", size: 0 })).toMatchObject({ valid: false, status: 400 });
    expect(validatePurchaseAgreementPDFUpload({ name: "pa.pdf", type: "application/pdf", size: 21 * 1024 * 1024 })).toMatchObject({ valid: false, status: 413 });
  });

  it("intègre la dropzone seulement aux ventes et protège la création contre le double clic", () => {
    const component = source("app/components/purchase-agreement-import.tsx");
    const offers = source("app/components/listing-offers.tsx");
    const route = source("app/api/purchase-agreements/parse/route.ts");

    expect(offers).toContain('listing.purpose === "sale" && <PurchaseAgreementImport');
    expect(offers).toContain("+ Ajouter une offre");
    expect(component).toContain('fetch("/api/purchase-agreements/parse"');
    expect(component).toContain("onDrop={onDrop}");
    expect(component).toContain('state === "loading"');
    expect(component).toContain('state === "created"');
    expect(component).toContain("submissionLock.current");
    expect(component).toContain("CETTE PA SEMBLE CONCERNER UN AUTRE IMMEUBLE");
    expect(component).toContain("VENDEUR À VÉRIFIER");
    expect(route).toContain("requireApiAccess()");
    expect(route).toContain("isSameOriginRequest(request)");
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).not.toContain("supabase");
  });

  it("ne crée ni Contact ni Transaction et ne touche pas au parseur Centris", () => {
    const component = source("app/components/purchase-agreement-import.tsx");
    const parser = source("app/lib/purchase-agreement/parse.ts");
    expect(component).not.toContain("addContact");
    expect(component).not.toContain("createTransaction");
    expect(component).not.toContain("acceptPa");
    expect(parser).not.toContain("parseCentrisText");
    expect(parser).not.toContain("fetch(");
  });
});
