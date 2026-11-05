import { describe, expect, it } from "vitest";
import { applyCentrisExtraction, parseCentrisPages } from "@/app/lib/tools/plex/infrastructure/pdf";

const extraction = parseCentrisPages([
  { page: 1, text: "17623159 (En vigueur) No Centris\n46-48 20e Avenue O.\nRégion\nPlan d'eau Laurentides 849 000 $\nJ7C 1E3\nBlainville Curé-Labelle\nSud Voir toutes les photos Genre de propriété Triplex Année de construction\nRevenus mensuels (résidentiel) - 3 unité(s) Numéro log. Fin de bail 46 2027-06-30 1 128 $ Loyer mensuel 5 Nbre pièces\nNuméro log. Fin de bail 48 2027-06-30 1 750 $ Loyer mensuel 5 Nbre pièces\nNuméro log. Fin de bail 48A 2027-06-30" },
  { page: 2, text: "798 $ Loyer mensuel 3 Nbre pièces\nRevenus bruts potentiels annuels 44 112 $" },
  { page: 4, text: "Taxe municipale (2026) 4 359 $\nTaxe scolaire (2025) 403 $\nAssurances 3 800 $\nDéneigement 636 $\nRevenus bruts effectifs 999 999 $\nRevenus nets d’exploitation 888 888 $" },
]);

const original = {
  property: { address: "Ancienne adresse", propertyType: "Duplex", unitCount: 4, askingPrice: 600000, analyzedPrice: 575000 },
  expenses: { municipalTaxes: 1, schoolTaxes: 2, insurance: 3, lawn: 4, snowRemoval: 5, maintenance: 6, repairs: 7, electricity: 8, heating: 9, management: 10, other: 11 },
  revenues: [1, 2, 3, 4].map((number) => ({ id: `unit-${number}`, description: `Démo ${number}`, currentMonthlyRent: 1000 + number, potentialMonthlyRent: 2000 + number, customMonthlyRent: 3000 + number, status: "occupied", otherMonthlyIncome: 100 })),
};

describe("transfert sécuritaire de l’extraction vers la calculatrice", () => {
  it("retire les anciennes données qui ne figurent pas dans le PDF", () => {
    const result = applyCentrisExtraction(original, extraction, new Set());
    expect(result.data.property).toEqual({ address: "46-48 20e Avenue O., Blainville J7C 1E3", propertyType: "Triplex", unitCount: 3, askingPrice: 849000, analyzedPrice: 849000 });
    expect(result.data.revenues).toHaveLength(3);
    expect(result.data.revenues.map((unit) => unit.currentMonthlyRent)).toEqual([1128, 1750, 798]);
    expect(result.data.revenues.every((unit) => unit.potentialMonthlyRent === 0)).toBe(true);
    expect(result.data.revenues.every((unit) => unit.customMonthlyRent === 0 && unit.otherMonthlyIncome === 0)).toBe(true);
    expect(result.data.expenses).toMatchObject({ municipalTaxes: 4359, schoolTaxes: 403, insurance: 3800, snowRemoval: 636, lawn: 0, maintenance: 0, repairs: 0, electricity: 0, heating: 0, management: 0, other: 0 });
    expect(extraction.reportedEffectiveGrossAnnualRevenue.value).toBe(999999);
    expect(extraction.reportedNetOperatingIncome.value).toBe(888888);
    expect(result.data.revenues.map((unit) => unit.currentMonthlyRent)).toEqual([1128, 1750, 798]);
    expect(result.analyzedPriceInitialized).toBe(true);
  });

  it("ne remplace jamais une correction manuelle", () => {
    const result = applyCentrisExtraction(original, extraction, new Set(["property.analyzedPrice", "revenue.unit-1.currentMonthlyRent", "revenue.unit-1.potentialMonthlyRent", "expense.insurance"]));
    expect(result.data.property.analyzedPrice).toBe(575000);
    expect(result.data.revenues[0].currentMonthlyRent).toBe(1001);
    expect(result.data.revenues[0].potentialMonthlyRent).toBe(2001);
    expect(result.data.expenses.insurance).toBe(3);
    expect(result.protectedLabels).toEqual(expect.arrayContaining(["Prix d’achat analysé", "Loyer actuel du logement 46", "Loyer potentiel du logement 46", "Assurance"]));
  });

  it("transfère les logements vacants et les lignes non détaillées sans inventer de valeur", () => {
    const partialExtraction = parseCentrisPages([
      {
        page: 1,
        text: "Nombre de logements : 3\nNuméro log. A Vacant 975 $ Valeur locative Loyer mensuel 4 Nbre pièces",
      },
    ]);
    const result = applyCentrisExtraction(original, partialExtraction, new Set());

    expect(result.data.revenues).toHaveLength(3);
    expect(result.data.revenues[0]).toMatchObject({
      description: "Logement A · 4 pièces",
      currentMonthlyRent: 0,
      potentialMonthlyRent: 975,
      status: "vacant",
    });
    expect(result.data.revenues.slice(1).every((unit) => (
      unit.description === "Information manquante" &&
      unit.currentMonthlyRent === 0 &&
      unit.potentialMonthlyRent === 0 &&
      unit.status === ""
    ))).toBe(true);
  });

  it("importe uniquement un taux de gestion explicitement exprimé en pourcentage", () => {
    const percentageExtraction = parseCentrisPages([
      { page: 1, text: "Gestion/Administration : 4,5 %" },
    ]);
    const fixedAmountExtraction = parseCentrisPages([
      { page: 1, text: "Gestion/Administration : 4 500 $" },
    ]);

    expect(applyCentrisExtraction(original, percentageExtraction, new Set()).data.expenses.management).toBe(4.5);
    expect(applyCentrisExtraction(original, fixedAmountExtraction, new Set()).data.expenses.management).toBe(0);
  });
});
