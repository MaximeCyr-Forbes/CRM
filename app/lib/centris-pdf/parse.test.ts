import { describe, expect, it } from "vitest";
import { parseCentrisText } from "./parse";
import { syntheticCentrisFixtures as fixtures } from "./synthetic-fixtures";
import { mapCentrisResultToTransactionSuggestions } from "./transaction-mapping";

const parse = (fixture: (typeof fixtures)[keyof typeof fixtures]) => parseCentrisText(fixture, "fixture-synthetique.pdf");

describe("parseur Centris synthétique", () => {
  it("conserve le numéro, le statut actif et les accents de l’adresse", () => {
    const active = parse(fixtures.condo);
    expect(active.centrisNumber).toBe("91000003");
    expect(active.centrisMarketStatus).toBe("active");
    expect(active.address.fullAddress).toContain("Av. Démo, app. 102");
  });

  it("reconnaît les principaux types de propriétés", () => {
    expect(parse(fixtures.residentialSale).property.normalizedType).toBe("residential");
    expect(parse(fixtures.land).property.normalizedType).toBe("land");
    expect(parse(fixtures.condo).property.normalizedType).toBe("condo");
    expect(parse(fixtures.incomeProperty).property.normalizedType).toBe("income_property");
    expect(parse(fixtures.commercialSale).property.normalizedType).toBe("commercial");
  });

  it("normalise les ventes, loyers mensuels et tarifs annuels au pied carré", () => {
    const sale = parse(fixtures.land);
    const monthly = parse(fixtures.commercialMonthly);
    const annual = parse(fixtures.commercialPerSquareFoot);
    expect(sale.pricing).toMatchObject({ detectedPurpose: "sale", amount: 325000, taxesApplicable: true });
    expect(monthly.pricing).toMatchObject({ mode: "monthly_rent", monthlyAmount: 5000, leaseTermMonths: 36, taxesApplicable: true });
    expect(annual.pricing).toMatchObject({ mode: "annual_per_square_foot", annualPerSquareFootAmount: 26, monthlyAmount: null, taxesApplicable: true });
    expect(annual.suggestedTransactionValues.price).toBeNull();
    expect(annual.warnings).toContain("Tarif annuel au pied carré détecté. Le prix de la Transaction doit être confirmé manuellement.");
  });

  it("préserve les adresses françaises structurées, les plages, appartements et locaux", () => {
    expect(parse(fixtures.incomeProperty).address).toMatchObject({ civicNumber: "40-44", street: "Rue Anonyme" });
    expect(parse(fixtures.condo).address).toMatchObject({ unit: "102", city: "Ville-Test", province: "QC", postalCode: "H0H 0H0" });
    expect(parse(fixtures.commercialPerSquareFoot).address).toMatchObject({ unit: "106-206" });
  });

  it("extrait les unités, revenus, taxes et frais de copropriété sans inventer", () => {
    const income = parse(fixtures.incomeProperty);
    expect(income.property.numberOfUnits).toBe(3);
    expect(income.rentalUnits.map((unit) => unit.monthlyRent)).toEqual([1100, 1200, 1300]);
    expect(income.financial).toMatchObject({ municipalTaxesAnnual: 4000, schoolTaxesAnnual: 500, grossPotentialRevenueAnnual: 43200, netOperatingIncomeAnnual: 38700 });
    expect(parse(fixtures.condo).financial.condoFeesMonthly).toBe(300);
  });

  it("sépare la date PA, le statut Centris et l’intergénération", () => {
    const sold = parse(fixtures.soldWithPromiseDate);
    expect(sold.centrisMarketStatus).toBe("sold");
    expect(sold.dates.paAcceptedDate).toBe("2026-04-21");
    expect(sold.dates.conditionsLiftedDate).toBe("2026-05-22");
    expect(sold.suggestedTransactionValues.promiseDate).toBe("2026-04-21");
    const intergenerational = parse(fixtures.intergenerational);
    expect(intergenerational.property).toMatchObject({ normalizedType: "residential", intergenerational: true });
    expect(intergenerational.financial.supplementalRevenueMonthly).toBe(700);
  });

  it("ne retourne aucune donnée du courtier ni de l’agence dans le résultat normalisé", () => {
    const serialized = JSON.stringify(parse(fixtures.residentialSale));
    expect(serialized).not.toContain("COURTIER TEST");
    expect(serialized).not.toContain("courtier@example.invalid");
    expect(serialized).not.toContain("000-000-0000");
    expect(serialized).not.toContain("AGENCE SYNTHÉTIQUE");
  });

  it("limite strictement le mapping Transaction aux cinq suggestions autorisées", () => {
    const result = parse(fixtures.residentialRental);
    const suggestions = mapCentrisResultToTransactionSuggestions(result);
    expect(Object.keys(suggestions).sort()).toEqual(["address", "centrisNumber", "generalNotes", "price", "promiseDate"]);
    expect(suggestions.price).toBe(6500);
    expect(suggestions).not.toHaveProperty("type");
    expect(suggestions).not.toHaveProperty("broker");
    expect(suggestions).not.toHaveProperty("status");
    expect(suggestions).not.toHaveProperty("contactIds");
  });
});
