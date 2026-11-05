import { describe, expect, it } from "vitest";
import { flattenCentrisExtraction, parseCentrisPages } from "@/app/lib/tools/plex/infrastructure/pdf";

describe("extraction Centris simple", () => {
  it("extrait une fiche complète sur plusieurs pages", () => {
    const extraction = parseCentrisPages([
      { page: 1, text: "Adresse : 1250 rue Ontario, Montréal (Québec)\nType d’immeuble : Triplex\nNombre de logements : 3\nPrix demandé : 725 000 $\nRevenus actuels : 58 800 $\nRevenus potentiels : 64 800 $\nLogement 1 : 4 ½ rez-de-chaussée | Loyer actuel : 1 650 $ | Loyer potentiel : 1 800 $\n" },
      { page: 2, text: "Taxes municipales : 5 400 $\nTaxes scolaires : 620 $\nAssurance : 2 650 $\nDéneigement : 950 $\n" },
    ]);
    expect(extraction.address.value).toContain("1250 rue Ontario");
    expect(extraction.askingPrice.value).toBe(725000);
    expect(extraction.municipalTaxes.page).toBe(2);
    expect(extraction.units[0].currentMonthlyRent.value).toBe(1650);
    expect(extraction.units[0].potentialMonthlyRent.status).toBe("to_review");
  });

  it("accepte quelques libellés alternatifs fiables", () => {
    const extraction = parseCentrisPages([{ page: 1, text: "Adresse de la propriété : 88 avenue du Parc, Québec\nGenre de propriété : Duplex\nNb. de logements : 2\nPrix de vente : 515 000 $\nTaxes scolaires : 410 $\n" }]);
    expect(extraction.propertyType.value).toBe("Duplex");
    expect(extraction.unitCount.value).toBe(2);
    expect(extraction.askingPrice.value).toBe(515000);
  });

  it("lit les revenus déclarés du sommaire financier agrégé sans utiliser la narration", () => {
    const extraction = parseCentrisPages([
      {
        page: 1,
        text: "Revenus mensuels (résidentiel) - 6 unité(s)\nRevenus bruts potentiels annuels 120 000 $ (2026-05-01)",
      },
      {
        page: 2,
        text: "L’immeuble générera un revenu annuel de 125 000 $/an à compter de juillet 2026.",
      },
      {
        page: 3,
        text: [
          "Sommaire financier",
          "Revenus bruts effectifs 117 000 $",
          "Dépenses d’exploitation",
          "Gestion/Administration",
          "Ordures 2 300 $",
          "Pelouse 2 100 $",
          "Total 37 000 $",
          "Revenus nets d’exploitation 80 000 $",
        ].join("\n"),
      },
    ]);

    expect(extraction.currentAnnualRevenue.value).toBeNull();
    expect(extraction.potentialAnnualRevenue.value).toBe(120000);
    expect(extraction.reportedEffectiveGrossAnnualRevenue).toMatchObject({
      value: 117000,
      page: 3,
      status: "confirmed",
    });
    expect(extraction.reportedNetOperatingIncome).toMatchObject({
      value: 80000,
      page: 3,
      status: "confirmed",
    });
    expect(extraction.reportedNetOperatingIncome.sourceText).toContain("80 000 $");
    expect(extraction.expenses.find((expense) => expense.key === "lawn")?.value).toBe(2100);
    expect(extraction.expenses.find((expense) => expense.key === "other")?.value).toBe(2300);
    expect(extraction.expenses.find((expense) => expense.key === "management")?.value).toBeNull();
    expect(flattenCentrisExtraction(extraction).filter(
      (field) => field.key === "reported-net-operating-income",
    )).toHaveLength(1);
  });

  it("ne transforme jamais un montant de gestion en pourcentage", () => {
    const percentage = parseCentrisPages([
      { page: 1, text: "Gestion/Administration : 5 %" },
    ]);
    const fixedAmount = parseCentrisPages([
      { page: 1, text: "Gestion/Administration : 4 500 $" },
    ]);

    expect(percentage.expenses.find((expense) => expense.key === "management")?.value).toBe(5);
    expect(fixedAmount.expenses.find((expense) => expense.key === "management")?.value).toBeNull();
  });

  it("laisse le revenu net déclaré manquant lorsqu’il n’est pas inscrit", () => {
    const extraction = parseCentrisPages([
      { page: 1, text: "Revenus bruts effectifs 90 000 $\nTotal des dépenses 25 000 $" },
    ]);

    expect(extraction.reportedEffectiveGrossAnnualRevenue.value).toBe(90000);
    expect(extraction.reportedNetOperatingIncome.value).toBeNull();
    expect(extraction.reportedNetOperatingIncome.status).toBe("missing");
  });

  it("signale explicitement les données absentes sans les inventer", () => {
    const extraction = parseCentrisPages([{ page: 1, text: "Adresse : 44 rue Principale, Sherbrooke\nRevenu brut actuel : 92 000 $\n" }]);
    expect(extraction.currentAnnualRevenue.value).toBe(92000);
    expect(extraction.askingPrice.value).toBeNull();
    expect(extraction.askingPrice.status).toBe("missing");
    expect(extraction.units).toHaveLength(0);
    expect(flattenCentrisExtraction(extraction).some((field) => field.value === null)).toBe(true);
  });

  it("interprète le format Centris Détail client à colonnes réordonnées", () => {
    const extraction = parseCentrisPages([
      { page: 1, text: "17623159 (En vigueur) No Centris\n46-48 20e Avenue O.\nRégion\nPlan d'eau Laurentides 849 000 $\nJ7C 1E3\nBlainville Curé-Labelle\nSud Voir toutes les photos Genre de propriété Triplex Année de construction\nRevenus mensuels (résidentiel) - 3 unité(s) Numéro log. Fin de bail 46 2027-06-30 1 128 $ Loyer mensuel 5 Nbre pièces\nNuméro log. Fin de bail 48 2027-06-30 1 750 $ Loyer mensuel 5 Nbre pièces\nNuméro log. Fin de bail 48A 2027-06-30" },
      { page: 2, text: "798 $ Loyer mensuel 3 Nbre pièces\nRevenus bruts potentiels annuels 44 112 $ (2026-06-26)" },
      { page: 4, text: "Taxe municipale (2026) 4 359 $\nTaxe scolaire (2025) 403 $\nAssurances 3 800 $\nDéneigement 636 $\nTotal 9 198 $" },
    ]);
    expect(extraction.address.value).toBe("46-48 20e Avenue O., Blainville J7C 1E3");
    expect(extraction.address.status).toBe("to_review");
    expect(extraction.askingPrice.value).toBe(849000);
    expect(extraction.propertyType.value).toBe("Triplex");
    expect(extraction.unitCount.value).toBe(3);
    expect(extraction.units.map((unit) => unit.currentMonthlyRent.value)).toEqual([1128, 1750, 798]);
    expect(extraction.units[2].currentMonthlyRent.page).toBe(2);
    expect(extraction.units.every((unit) => unit.potentialMonthlyRent.value === null)).toBe(true);
    expect(extraction.currentAnnualRevenue.value).toBe(44112);
    expect(extraction.potentialAnnualRevenue.value).toBe(44112);
    expect(extraction.municipalTaxes.value).toBe(4359);
    expect(extraction.schoolTaxes.value).toBe(403);
    expect(extraction.expenses.find((expense) => expense.key === "insurance")?.value).toBe(3800);
    expect(extraction.expenses.find((expense) => expense.key === "snowRemoval")?.value).toBe(636);
    expect(extraction.expenses.find((expense) => expense.key === "maintenance")?.status).toBe("missing");
  });

  it.each([
    ["1 250 000", 1_250_000],
    ["12 500 000", 12_500_000],
    ["100 000 000", 100_000_000],
    ["1\u00a0250\u00a0000", 1_250_000],
    ["1\u202f250\u202f000", 1_250_000],
    ["1250000", 1_250_000],
    ["1,250,000", 1_250_000],
    ["1.250.000", 1_250_000],
  ])("conserve le prix complet de l’en-tête Centris : %s $", (formattedPrice, expected) => {
    const extraction = parseCentrisPages([
      {
        page: 1,
        text: [
          "12345678 (En vigueur) No Centris",
          "10 rue Exemple",
          "Région",
          `Plan d'eau Exemple ${formattedPrice} $`,
          "J0J 0J0",
          "Ville Exemple",
          "Genre de propriété Multiplex Année de construction 2000",
        ].join("\n"),
      },
    ]);

    expect(extraction.askingPrice.value).toBe(expected);
  });

  it("utilise la même lecture fiable pour les prix, revenus, taxes et dépenses", () => {
    const extraction = parseCentrisPages([
      {
        page: 1,
        text: [
          "Prix demandé : 100 000 000 $",
          "Revenus actuels : 12,500,000 $",
          "Revenus potentiels : 12.750.000 $",
          "Taxes municipales : 1\u202f250\u202f000 $",
          "Taxes scolaires : 1250000 $",
          "Assurance : 1.250.000,50 $",
        ].join("\n"),
      },
    ]);

    expect(extraction.askingPrice.value).toBe(100_000_000);
    expect(extraction.currentAnnualRevenue.value).toBe(12_500_000);
    expect(extraction.potentialAnnualRevenue.value).toBe(12_750_000);
    expect(extraction.municipalTaxes.value).toBe(1_250_000);
    expect(extraction.schoolTaxes.value).toBe(1_250_000);
    expect(extraction.expenses.find((expense) => expense.key === "insurance")?.value).toBe(1_250_000.5);
  });

  it("conserve les fractions de pièce explicitement inscrites par logement", () => {
    const extraction = parseCentrisPages([
      {
        page: 1,
        text: "Revenus mensuels (résidentiel) - 3 unité(s) Numéro log. 1 1 000 $ Loyer mensuel 5 1/2 Nbre pièces\nNuméro log. 2 1 100 $ Loyer mensuel Nbre pièces : 4½\nNuméro log. 3 1 200 $ Loyer mensuel 5 et demi Nbre pièces\nRevenus bruts potentiels annuels 39 600 $",
      },
    ]);

    expect(extraction.units.map((unit) => unit.description.value)).toEqual([
      "Logement 1 · 5 1/2 pièces",
      "Logement 2 · 4½ pièces",
      "Logement 3 · 5 et demi pièces",
    ]);
  });

  it("conserve les logements vacants et distingue leur valeur locative du loyer actuel", () => {
    const extraction = parseCentrisPages([
      {
        page: 1,
        text: [
          "Nombre de logements : 6",
          "Numéro log. 1 Fin de bail 910 $ Loyer mensuel 4 Nbre pièces",
          "Numéro log. 2 Fin de bail 920 $ Loyer mensuel 4 Nbre pièces",
          "Numéro log. 3 Fin de bail Vacant 1 250 $ Valeur locative Loyer mensuel 4 Nbre pièces",
        ].join("\n"),
      },
      {
        page: 2,
        text: [
          "Numéro log. 4 Fin de bail 930 $ Loyer mensuel 4 Nbre pièces",
          "Numéro log. 5 Fin de bail 940 $ Loyer mensuel 4 Nbre pièces",
          "Numéro log. 6 Fin de bail Vacant Valeur locative 1 300 $ Loyer mensuel 4 Nbre pièces",
          "Revenus bruts potentiels annuels 75 000 $",
        ].join("\n"),
      },
    ]);

    expect(extraction.units).toHaveLength(6);
    expect(extraction.units.map((unit) => unit.description.value)).toEqual(
      [1, 2, 3, 4, 5, 6].map((number) => `Logement ${number} · 4 pièces`),
    );
    expect(extraction.units.map((unit) => unit.currentMonthlyRent.value)).toEqual([
      910,
      920,
      null,
      930,
      940,
      null,
    ]);
    expect(extraction.units.map((unit) => unit.potentialMonthlyRent.value)).toEqual([
      null,
      null,
      1250,
      null,
      null,
      1300,
    ]);
    expect(extraction.units[2].occupancyStatus.value).toBe("vacant");
    expect(extraction.units[5].occupancyStatus.value).toBe("vacant");
    expect(extraction.units[2].potentialMonthlyRent.status).toBe("to_review");
    expect(extraction.units[5].potentialMonthlyRent.page).toBe(2);
    expect(extraction.currentAnnualRevenue.value).toBe((910 + 920 + 930 + 940) * 12);
  });

  it("affiche le nombre déclaré de logements sans inventer les détails absents", () => {
    const extraction = parseCentrisPages([
      {
        page: 1,
        text: [
          "Nombre de logements : 6",
          "Numéro log. A 800 $ Loyer mensuel 3 Nbre pièces",
          "Numéro log. B 810 $ Loyer mensuel 3 Nbre pièces",
          "Numéro log. C 820 $ Loyer mensuel 3 Nbre pièces",
          "Numéro log. D 830 $ Loyer mensuel 3 Nbre pièces",
        ].join("\n"),
      },
    ]);

    expect(extraction.units).toHaveLength(6);
    expect(extraction.units.slice(0, 4).every((unit) => unit.description.value !== null)).toBe(true);
    expect(extraction.units.slice(4).every((unit) => unit.description.value === null)).toBe(true);
    expect(extraction.units.slice(4).every((unit) => unit.currentMonthlyRent.value === null)).toBe(true);
    expect(extraction.units.slice(4).every((unit) => unit.occupancyStatus.value === null)).toBe(true);
    expect(extraction.currentAnnualRevenue.value).toBeNull();
  });

  it("n’impose aucune limite fixe au nombre de logements détaillés", () => {
    const rentRoll = Array.from(
      { length: 32 },
      (_, index) => `Numéro log. ${index + 1} ${801 + index} $ Loyer mensuel 4 Nbre pièces`,
    ).join("\n");
    const extraction = parseCentrisPages([
      { page: 1, text: `Nombre de logements : 32\n${rentRoll}` },
    ]);

    expect(extraction.units).toHaveLength(32);
    expect(extraction.units[0].description.value).toBe("Logement 1 · 4 pièces");
    expect(extraction.units[31].description.value).toBe("Logement 32 · 4 pièces");
    expect(extraction.units[31].currentMonthlyRent.value).toBe(832);
    expect(extraction.units.every((unit) => unit.description.value !== null)).toBe(true);
  });
});
