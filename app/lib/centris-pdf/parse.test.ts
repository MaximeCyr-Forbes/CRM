import { describe, expect, it } from "vitest";
import { buildCentrisListingGeneralNotes } from "./listing-form-import";
import { parseCentrisText } from "./parse";
import { syntheticCentrisFixtures as fixtures } from "./synthetic-fixtures";
import { mapCentrisResultToTransactionSuggestions } from "./transaction-mapping";

const parse = (fixture: (typeof fixtures)[keyof typeof fixtures]) => parseCentrisText(fixture, "fixture-synthetique.pdf");

function parseAddress(address: string) {
  return parseCentrisText({
    pageCount: 1,
    pages: [{
      pageNumber: 1,
      text: `16356100 (En vigueur) No Centris ${address} Région Laurentides Quartier Près de Parc 549 000 $ J7P 5J6 Saint-Eustache Parc Genre de propriété Maison de plain-pied Année de construction 1987`,
    }],
  }, "adresse-synthetique.pdf").address;
}

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
    expect(monthly.property.availableAreaSqFt).toBe(1700);
    expect(annual.pricing).toMatchObject({ mode: "annual_per_square_foot", annualPerSquareFootAmount: 26, monthlyAmount: null, taxesApplicable: true });
    expect(annual.suggestedTransactionValues.price).toBeNull();
    expect(annual.warnings).toContain("Tarif annuel au pied carré détecté. Le prix de la Transaction doit être confirmé manuellement.");
  });

  it("préserve les adresses françaises structurées, les plages, appartements et locaux", () => {
    expect(parse(fixtures.incomeProperty).address).toMatchObject({ civicNumber: "40-44", street: "Rue Anonyme" });
    expect(parse(fixtures.condo).address).toMatchObject({ unit: "102", city: "Ville-Test", province: "QC", postalCode: "H0H 0H0" });
    expect(parse(fixtures.commercialPerSquareFoot).address).toMatchObject({ unit: "106-206" });
  });

  it("rattache la lettre collée au numéro civique dans le cas réel 64Z Rue Adélard", () => {
    const result = parse(fixtures.civicSuffix);
    expect(result.address).toMatchObject({
      civicNumber: "64Z",
      street: "Rue Adélard",
      city: "Saint-Eustache",
      province: "QC",
      postalCode: "J7P 5J6",
    });
    expect(result.address.fullAddress).toMatch(/^64Z Rue Adélard/);
    expect(result.suggestedTransactionValues.address).toBe("64Z Rue Adélard, Saint-Eustache, QC J7P 5J6");
  });

  it.each([
    ["123A Rue Principale", "123A", "Rue Principale"],
    ["123 Rue Zéphyr", "123", "Rue Zéphyr"],
    ["40-44 Rue Anonyme", "40-44", "Rue Anonyme"],
    ["40A-44B Rue Exemple", "40A-44B", "Rue Exemple"],
    ["1120 Boul. du Curé-Labelle", "1120", "Boul. du Curé-Labelle"],
  ])("sépare %s en numéro %s et rue %s", (rawAddress, civicNumber, street) => {
    expect(parseAddress(rawAddress)).toMatchObject({ civicNumber, street });
  });

  it.each([
    ["123A Rue Exemple, app. 4", "4"],
    ["123A Rue Exemple, local 106", "106"],
    ["123A Rue Exemple, unité 2", "2"],
  ])("conserve le suffixe civique et l’unité de %s", (rawAddress, unit) => {
    expect(parseAddress(rawAddress)).toMatchObject({
      civicNumber: "123A",
      street: "Rue Exemple",
      unit,
    });
  });

  it("ignore complètement le champ Près de sans contaminer l’adresse, la Transaction ou le Listing", () => {
    const result = parse(fixtures.saintSauveur);
    expect(result.address).toEqual({
      fullAddress: "146 Ch. Legault, Saint-Sauveur, QC J0R 1R7",
      civicNumber: "146",
      street: "Ch. Legault",
      unit: "",
      city: "Saint-Sauveur",
      province: "QC",
      postalCode: "J0R 1R7",
    });
    expect(JSON.stringify(result.address)).not.toMatch(/Sinclair|Près de/i);
    expect(result.suggestedTransactionValues.address).toBe("146 Ch. Legault, Saint-Sauveur, QC J0R 1R7");
    expect(result.suggestedTransactionValues.generalNotes).not.toMatch(/Sinclair|Près de/i);
  });

  it.each(["ch. Sinclair", "rue Principale", "boul. Curé-Labelle", "Autoroute 15", "Lac XYZ"])(
    "écarte la valeur trompeuse Près de %s",
    (proximity) => {
      const fixture = {
        pageCount: 1,
        pages: [{
          pageNumber: 1,
          text: `14262312 (En vigueur) No Centris 146 Ch. Legault Région Laurentides Quartier Près de ${proximity} 869 000 $ J0R 1R7 Saint-Sauveur ${proximity} Genre de propriété Maison à étages Année de construction 2004`,
        }],
      };
      const result = parseCentrisText(fixture, "proximite.pdf");
      expect(result.address).toMatchObject({
        civicNumber: "146",
        street: "Ch. Legault",
        city: "Saint-Sauveur",
        postalCode: "J0R 1R7",
      });
      expect(JSON.stringify(result.address)).not.toContain(proximity);
    },
  );

  it("limite strictement le cas réel 64Z au seul bloc d’adresse postale", () => {
    const result = parseCentrisText({
      pageCount: 1,
      pages: [{
        pageNumber: 1,
        text: `16356100 (En vigueur) No Centris 64Z Rue Adélard Région Laurentides Quartier Est Près de 41e Avenue Plan d’eau Rivière des Mille-Îles 549 000 $ J7P 5J6 Saint-Eustache 41e Avenue Genre de propriété Maison de plain-pied Année de construction 1987`,
      }],
    }, "cas-reel-64z.pdf");

    expect(result.address).toEqual({
      fullAddress: "64Z Rue Adélard, Saint-Eustache, QC J7P 5J6",
      civicNumber: "64Z",
      street: "Rue Adélard",
      unit: "",
      city: "Saint-Eustache",
      province: "QC",
      postalCode: "J7P 5J6",
    });
    expect(Object.keys(result.address).sort()).toEqual([
      "city",
      "civicNumber",
      "fullAddress",
      "postalCode",
      "province",
      "street",
      "unit",
    ]);
    const serializedAddress = JSON.stringify(result.address);
    for (const forbiddenValue of ["Laurentides", "Est", "41e Avenue", "Rivière des Mille-Îles"]) {
      expect(serializedAddress).not.toContain(forbiddenValue);
      expect(result.suggestedTransactionValues.generalNotes).not.toContain(forbiddenValue);
      expect(buildCentrisListingGeneralNotes(result)).not.toContain(forbiddenValue);
    }
    expect(result.suggestedTransactionValues.address).toBe("64Z Rue Adélard, Saint-Eustache, QC J7P 5J6");
  });

  it("ignore Région, Quartier, Près de et Plan d’eau même quand leurs valeurs sont trompeuses", () => {
    const result = parseCentrisText({
      pageCount: 1,
      pages: [{
        pageNumber: 1,
        text: `76543210 (En vigueur) No Centris 123 Rue Secondaire Région Laval Quartier Rosemont Près de Rue Principale Plan d’eau Fleuve Saint-Laurent 650 000 $ H7X 1A1 Sainte-Dorothée Rue Principale Genre de propriété Maison à étages Année de construction 2001`,
      }],
    }, "zone-interdite.pdf");

    expect(result.address).toEqual({
      fullAddress: "123 Rue Secondaire, Sainte-Dorothée, QC H7X 1A1",
      civicNumber: "123",
      street: "Rue Secondaire",
      unit: "",
      city: "Sainte-Dorothée",
      province: "QC",
      postalCode: "H7X 1A1",
    });
    const serializedAddress = JSON.stringify(result.address);
    for (const forbiddenValue of ["Laval", "Rosemont", "Rue Principale", "Fleuve Saint-Laurent"]) {
      expect(serializedAddress).not.toContain(forbiddenValue);
      expect(result.suggestedTransactionValues.generalNotes).not.toContain(forbiddenValue);
      expect(buildCentrisListingGeneralNotes(result)).not.toContain(forbiddenValue);
    }
  });

  it("accepte un quartier et un plan d’eau vides sans aucun fallback géographique", () => {
    const result = parseCentrisText({
      pageCount: 1,
      pages: [{
        pageNumber: 1,
        text: `14262312 (En vigueur) No Centris 146 Ch. Legault Région Laurentides Quartier Près de ch. Sinclair Plan d’eau 869 000 $ J0R 1R7 Saint-Sauveur ch. Sinclair Genre de propriété Maison à étages Année de construction 2004`,
      }],
    }, "champs-vides.pdf");

    expect(result.address).toEqual({
      fullAddress: "146 Ch. Legault, Saint-Sauveur, QC J0R 1R7",
      civicNumber: "146",
      street: "Ch. Legault",
      unit: "",
      city: "Saint-Sauveur",
      province: "QC",
      postalCode: "J0R 1R7",
    });
    expect(JSON.stringify(result.address)).not.toMatch(/Laurentides|Sinclair/i);
  });

  it("préserve l’appartement lorsque la ville et le code postal précèdent la zone interdite", () => {
    const result = parseCentrisText({
      pageCount: 1,
      pages: [{
        pageNumber: 1,
        text: `91000003 (En vigueur) No Centris 30 Av. Démo, app. 102 Ville-Test H0H 0H0 Région Montréal Quartier Rosemont Près de boul. Saint-Laurent Plan d’eau Fleuve Saint-Laurent 499 000 $ Genre de propriété Appartement Année de construction 2018`,
      }],
    }, "ordre-pdf-desordonne.pdf");

    expect(result.address).toEqual({
      fullAddress: "30 Av. Démo, app. 102, Ville-Test, QC H0H 0H0",
      civicNumber: "30",
      street: "Av. Démo",
      unit: "102",
      city: "Ville-Test",
      province: "QC",
      postalCode: "H0H 0H0",
    });
    expect(JSON.stringify(result.address)).not.toMatch(/Montréal|Rosemont|Saint-Laurent|Fleuve/i);
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
