import { describe, expect, it } from "vitest";
import { appNavigationOrder, softwareLinks } from "./software-links";

describe("navigation des logiciels", () => {
  it("place Statistiques entre Calendrier et Logiciels", () => {
    expect(appNavigationOrder).toEqual([
      "Accueil",
      "Contacts",
      "Listings",
      "Transactions",
      "Calendrier",
      "Statistiques",
      "Courriels Auto",
      "Logiciels",
      "Paramètres",
    ]);
    expect(appNavigationOrder.at(-1)).toBe("Paramètres");
  });

  it("centralise les trois applications externes attendues", () => {
    expect(softwareLinks).toEqual([
      {
        label: "Générateur de courriel",
        description: "Création de courriels immobiliers",
        href: "https://courriel-pa-accept-e.vercel.app/",
      },
      {
        label: "Calculatrice Plex",
        description: "Analyse financière d'immeubles à revenus",
        href: "https://analyse-plex-quebec.vercel.app/",
      },
      {
        label: "Générateur ACM",
        description: "Génération d’analyses comparatives de marché",
        href: "https://acmgenerator.vercel.app/",
      },
    ]);
  });

  it("pointe le Générateur ACM vers son URL exacte", () => {
    expect(softwareLinks.find((software) => software.label === "Générateur ACM")?.href)
      .toBe("https://acmgenerator.vercel.app/");
  });

  it("n'accepte que des liens HTTPS uniques", () => {
    expect(softwareLinks.every((software) => new URL(software.href).protocol === "https:")).toBe(true);
    expect(new Set(softwareLinks.map((software) => software.href)).size).toBe(softwareLinks.length);
  });
});
