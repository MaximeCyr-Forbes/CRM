import { describe, expect, it } from "vitest";
import { appNavigationOrder, softwareLinks } from "./software-links";

describe("navigation des logiciels", () => {
  it("place Statistiques entre Calendrier et Logiciels", () => {
    expect(appNavigationOrder).toEqual([
      "Accueil",
      "Contacts",
      "Listings",
      "Transactions", "Réf. hypothécaires",
      "Calendrier",
      "Drive",
      "Statistiques",
  "Comptabilité",
  "Pancartes / BAC",
      "Courriels Auto",
      "Logiciels",
      "Paramètres",
    ]);
    expect(appNavigationOrder.at(-1)).toBe("Paramètres");
  });

  it("centralise les trois modules internes attendues", () => {
    expect(softwareLinks).toEqual([
      {
        label: "Générateur de courriel",
        description: "Création de courriels immobiliers",
        href: "/logiciels/generateur-courriel",
      },
      {
        label: "Calculatrice Plex",
        description: "Analyse financière d'immeubles à revenus",
        href: "/logiciels/calculatrice-plex",
      },
      {
        label: "Générateur ACM",
        description: "Génération d’analyses comparatives de marché",
        href: "/logiciels/generateur-acm",
      },
    ]);
  });

  it("pointe le Générateur ACM vers son URL exacte", () => {
    expect(softwareLinks.find((software) => software.label === "Générateur ACM")?.href)
      .toBe("/logiciels/generateur-acm");
  });

  it("n'accepte que des routes internes uniques", () => {
    expect(softwareLinks.every((software) => software.href.startsWith("/logiciels/"))).toBe(true);
    expect(new Set(softwareLinks.map((software) => software.href)).size).toBe(softwareLinks.length);
  });
});
