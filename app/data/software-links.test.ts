import { describe, expect, it } from "vitest";
import { appNavigationOrder, softwareLinks } from "./software-links";

describe("navigation des logiciels", () => {
  it("place Logiciels entre Transactions et Paramètres", () => {
    expect(appNavigationOrder).toEqual([
      "Accueil",
      "Contacts",
      "Transactions",
      "Logiciels",
      "Paramètres",
    ]);
    expect(appNavigationOrder.at(-1)).toBe("Paramètres");
  });

  it("centralise les deux applications externes attendues", () => {
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
    ]);
  });

  it("n'accepte que des liens HTTPS uniques", () => {
    expect(softwareLinks.every((software) => new URL(software.href).protocol === "https:")).toBe(true);
    expect(new Set(softwareLinks.map((software) => software.href)).size).toBe(softwareLinks.length);
  });
});
