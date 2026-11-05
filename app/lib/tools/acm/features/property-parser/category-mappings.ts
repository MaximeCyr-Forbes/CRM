import type { PropertyCategory } from "@/app/lib/tools/acm/types";

export interface CategoryMapping {
  category: PropertyCategory;
  keywords: readonly string[];
}

/**
 * Source de vérité éditable pour la catégorisation Centris.
 * Les termes sont comparés après normalisation des accents et de la casse.
 */
export const PROPERTY_CATEGORY_MAPPINGS: readonly CategoryMapping[] = [
  {
    category: "multi_category",
    keywords: [
      "multi-categorie",
      "multicategorie",
      "usage mixte",
      "residentiel et commercial",
      "commercial et residentiel",
      "commercial / residentiel",
      "residentiel / commercial",
      "commercial-residentiel",
      "multi-usage",
    ],
  },
  {
    category: "income_property",
    keywords: [
      "duplex",
      "triplex",
      "quadruplex",
      "quintuplex",
      "sixplex",
      "multiplex",
      "multilogement",
      "immeuble a revenus",
      "propriete a revenus",
    ],
  },
  {
    category: "condo",
    keywords: [
      "appartement",
      "copropriete",
      "condominium",
      "condo",
      "divise",
      "indivise",
    ],
  },
  {
    category: "farm",
    keywords: ["ferme", "fermette", "agricole", "exploitation agricole"],
  },
  {
    category: "commercial_industrial",
    keywords: [
      "commercial",
      "industriel",
      "bureau",
      "entrepot",
      "commerce",
      "batiment commercial",
      "batiment industriel",
    ],
  },
  {
    category: "land",
    keywords: ["terrain vacant", "terrain residentiel", "terre vacante", "lot vacant", "terrain sans batiment", "terrain"],
  },
  {
    category: "single_family",
    keywords: [
      "unifamiliale",
      "maison de plain-pied",
      "plain-pied",
      "maison a etages",
      "maison a un etage",
      "maison a paliers multiples",
      "cottage",
      "bungalow",
      "maison mobile",
      "maison en rangee",
      "maison jumelee",
    ],
  },
] as const;
