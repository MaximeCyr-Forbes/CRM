import { describe, expect, it } from "vitest";
import { createReportFileName, sanitizeFileNamePart } from "./file-name";

describe("nom du fichier de brochure", () => {
  it("retire les accents et caractères problématiques", () => {
    expect(createReportFileName("373, 4e Avenue", "Deux-Montagnes")).toBe("ACM_373_4e_Avenue_Deux-Montagnes.pdf");
  });

  it("nettoie les espaces multiples et symboles", () => {
    expect(sanitizeFileNamePart("  Étage # 2 / unité 5  ")).toBe("Etage_2_unite_5");
  });

  it("fournit un nom stable sans adresse", () => {
    expect(createReportFileName()).toBe("ACM_Propriete.pdf");
  });
});
