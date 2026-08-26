import { describe, expect, it } from "vitest";
import type { PositionedPDFPage, PositionedPDFTextItem } from "../pdf/extract-positioned-text";
import { parsePurchaseAgreement } from "./parse";

function item(text: string, x: number, y: number, width = Math.max(text.length * 5, 10)): PositionedPDFTextItem {
  return { text, x, y, width };
}

function page(pageNumber: number, items: PositionedPDFTextItem[]): PositionedPDFPage {
  return {
    pageNumber,
    width: 612,
    height: 792,
    text: items.map((entry) => entry.text).join(" "),
    items,
  };
}

function fictionalPurchaseAgreement() {
  const pages = [
    page(1, [
      item("PROMESSE D’ACHAT", 205, 750),
      item("1. IDENTIFICATION DES PARTIES", 35, 630),
      item("Camille", 45, 607), item("Moreau", 91, 607),
      item("Élise", 338, 607), item("Dufour", 375, 607),
      item("ACHETEUR 1 (nom, prénom, adresse et courriel)", 35, 510),
      item("VENDEUR 1 (nom, prénom, adresse et courriel)", 330, 510),
      item("Thomas", 45, 478), item("Girard", 99, 478),
      item("ACHETEUR 2 (nom, prénom, adresse et courriel)", 35, 381),
      item("VENDEUR 2 (nom, prénom, adresse et courriel)", 330, 381),
      item("ACHETEUR 3 (nom, prénom, adresse et courriel)", 35, 252),
      item("VENDEUR 3 (nom, prénom, adresse et courriel)", 330, 252),
      item("ACHETEUR 4 (nom, prénom, adresse et courriel)", 35, 123),
      item("VENDEUR 4 (nom, prénom, adresse et courriel)", 330, 123),
    ]),
    page(2, [
      item("3. DESCRIPTION SOMMAIRE DE L’IMMEUBLE", 35, 640),
      item("3.1", 35, 603),
      item("42-44, Rue des Érables, Québec, G1A 2B3, QC", 65, 588),
      item("4.", 35, 475), item("PRIX ET ACOMPTE", 65, 475),
      item("4.1", 35, 452),
      item("L’ACHETEUR promet de payer 625 000,00 $", 65, 436),
      item("4.2", 35, 360),
    ]),
    page(3, [
      item("FINANCEMENT HYPOTHÉCAIRE", 35, 650),
      item("Le montant du prêt sera de 500 000,00 $", 65, 610),
    ]),
  ];
  return { pageCount: pages.length, pages };
}

describe("parseur déterministe de Promesse d’achat", () => {
  it("distingue les parties et limite l’extraction aux sections OACIQ demandées", () => {
    const result = parsePurchaseAgreement(fictionalPurchaseAgreement());

    expect(result.recognized).toBe(true);
    expect(result.buyers).toEqual(["Camille Moreau", "Thomas Girard"]);
    expect(result.sellers).toEqual(["Élise Dufour"]);
    expect(result.buyers).not.toContain("Élise Dufour");
    expect(result.sellers).not.toContain("Camille Moreau");
    expect(result.sellers).not.toContain("Thomas Girard");
    expect(result.propertyAddress).toEqual({
      fullAddress: "42-44 Rue des Érables, Québec, G1A 2B3, QC",
      civicNumber: "42-44",
      street: "Rue des Érables",
      city: "Québec",
      province: "QC",
      postalCode: "G1A 2B3",
    });
    expect(result.amount).toBe(625000);
    expect(result.amount).not.toBe(500000);
  });

  it("refuse un document sans les quatre marqueurs forts", () => {
    const result = parsePurchaseAgreement({
      pageCount: 1,
      pages: [page(1, [item("Document immobilier générique", 20, 700)])],
    });

    expect(result.recognized).toBe(false);
    expect(result.buyers).toEqual([]);
    expect(result.sellers).toEqual([]);
    expect(result.amount).toBeNull();
    expect(result.warnings).toContain("PROMESSE D’ACHAT NON RECONNUE");
  });

  it("préserve l’ordre des quatre emplacements de chaque colonne", () => {
    const fixture = fictionalPurchaseAgreement();
    fixture.pages[0].items.push(
      item("Nora Bouchard", 338, 478),
      item("Sofia Lambert", 45, 349), item("Louis Martel", 338, 349),
      item("Alex Roy", 45, 220), item("Mila Fortin", 338, 220),
    );
    fixture.pages[0].text = fixture.pages[0].items.map((entry) => entry.text).join(" ");

    const parsed = parsePurchaseAgreement(fixture);
    expect(parsed.buyers).toEqual(["Camille Moreau", "Thomas Girard", "Sofia Lambert", "Alex Roy"]);
    expect(parsed.sellers).toEqual(["Élise Dufour", "Nora Bouchard", "Louis Martel", "Mila Fortin"]);
  });

  it("accepte un prix sans décimales lorsqu’il reste dans la clause 4.1", () => {
    const fixture = fictionalPurchaseAgreement();
    const price = fixture.pages[1].items.find((entry) => entry.y === 436);
    if (price) price.text = "L’ACHETEUR promet de payer 625 000 $";
    fixture.pages[1].text = fixture.pages[1].items.map((entry) => entry.text).join(" ");
    expect(parsePurchaseAgreement(fixture).amount).toBe(625000);
  });

  it("signale chaque donnée obligatoire manquante sans inventer de valeur", () => {
    const fixture = fictionalPurchaseAgreement();
    fixture.pages[0].items = fixture.pages[0].items.filter((entry) => ![607, 478].includes(entry.y));
    fixture.pages[0].text = fixture.pages[0].items.map((entry) => entry.text).join(" ");
    fixture.pages[1].items = fixture.pages[1].items.filter((entry) => entry.y !== 588 && entry.y !== 436);
    fixture.pages[1].text = fixture.pages[1].items.map((entry) => entry.text).join(" ");

    const result = parsePurchaseAgreement(fixture);
    expect(result.buyers).toEqual([]);
    expect(result.propertyAddress.fullAddress).toBe("");
    expect(result.amount).toBeNull();
    expect(result.warnings).toEqual(expect.arrayContaining([
      "Acheteur manquant dans la section 1.",
      "Adresse de l’immeuble manquante à la clause 3.1.",
      "Prix offert manquant à la clause 4.1.",
    ]));
  });
});
