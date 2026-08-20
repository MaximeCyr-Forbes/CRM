import { describe, expect, it } from "vitest";
import { cleanCentrisPage, normalizeCentrisText } from "./normalize-text";

describe("normalisation du texte Centris", () => {
  it("préserve les accents et normalise les espaces, ligatures et tirets", () => {
    expect(normalizeCentrisText("Copropriété\u00a0— ﬁche")).toBe("Copropriété - fiche");
  });

  it("ignore les pieds de page et les légendes répétitives des pages de photos", () => {
    const cleaned = cleanCentrisPage(
      "91000001 (En vigueur) No Centris 10 Rue Démo Région Quartier Près de Parc "
      + "Voir toutes les photos Façade Façade Façade "
      + "No Centris 91000001 - Page 1 de 2 2026-08-20 à 10h00",
    );
    expect(cleaned).toContain("10 Rue Démo");
    expect(cleaned).not.toContain("Voir toutes les photos");
    expect(cleaned).not.toContain("Page 1 de 2");
    expect(cleaned).not.toContain("Façade Façade");
  });
});
