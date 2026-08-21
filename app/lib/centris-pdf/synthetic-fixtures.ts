import type { ExtractedPDFText } from "./types";

function document(text: string): ExtractedPDFText {
  return { pageCount: 1, pages: [{ pageNumber: 1, text }] };
}

const footer = "Inclusions Luminaires synthétiques Exclusions Biens personnels synthétiques Remarques Texte marketing anonymisé Addenda Vérification humaine requise Déclaration du vendeur Non Source AGENCE SYNTHÉTIQUE, Agence immobilière";
const header = (
  number: string,
  status: string,
  address: string,
  price: string,
  postal = "H0H 0H0",
  city = "Ville-Test",
  proximity = "Parc",
) => `COURTIER TEST courtier@example.invalid 000-000-0000 ${number} (${status}) No Centris ${address} Région Laurentides Quartier Près de ${proximity} ${price} ${postal} ${city} ${proximity} Voir toutes les photos`;

export const syntheticCentrisFixtures = {
  residentialSale: document(`${header("91000001", "En vigueur", "10 Rue de l'Exemple", "750 000 $")} Genre de propriété Maison à étages Année de construction Date de livraison prévue 2015 Nbre pièces 2+1 Nbre salles de bains + salles d'eau 3+1 Nbre chambres (hors-sol + sous-sol) 12 ${footer}`),
  land: document(`${header("91000002", "En vigueur", "20 Ch. Fictif", "325 000 $ + TPS/TVQ")} Genre Non Reprise/Contrôle de justice Terrain Possibilité d'échange 9 500 pc Superficie du terrain Zonage Résidentiel ${footer}`),
  condo: document(`${header("91000003", "En vigueur", "30 Av. Démo, app. 102", "499 000 $")} Genre de propriété Appartement Année de construction Date de livraison prévue 2018 3 600 $ Frais de cop. (300 $/mois) ${footer}`),
  incomeProperty: document(`${header("91000004", "En vigueur", "40-44 Rue Anonyme", "1 100 000 $")} Genre de propriété Triplex Année de construction Date de livraison prévue 2010 Revenus mensuels (résidentiel) - 3 unité(s) Numéro log. Fin de bail 40 2027-06-30 2 Nbre chambres (hors-sol + sous-sol) 1 100 $ Loyer mensuel 4 Nbre pièces 1+0 Nbre SDB + SE Numéro log. Fin de bail 42 2027-06-30 2 Nbre chambres (hors-sol + sous-sol) 1 200 $ Loyer mensuel 4 Nbre pièces 1+0 Nbre SDB + SE Numéro log. Fin de bail 44 2027-06-30 2 Nbre chambres (hors-sol + sous-sol) 1 300 $ Loyer mensuel 4 Nbre pièces 1+0 Nbre SDB + SE Revenus bruts potentiels annuels 43 200 $ Taxe municipale (2026) 4 000 $ Taxe scolaire (2026) 500 $ Revenus nets d'exploitation 38 700 $ ${footer}`),
  commercialSale: document(`${header("91000005", "En vigueur", "50 Boul. Prototype", "2 500 000 $ + TPS/TVQ")} Genre de propriété Commerciale Année de construction 2023 6 800 pc Superficie du bâtiment ${footer}`),
  commercialMonthly: document(`${header("91000006", "En vigueur", "60 Boul. Location", "5 000 $/mois + TPS/TVQ X 36 mois")} Genre de propriété Commerciale Année de construction 2009 Utilisation de l'espace - Superficie disponible de 1 700 pc ${footer}`),
  commercialPerSquareFoot: document(`${header("91000007", "En vigueur", "70 Ch. Industriel, local 106-206", "26,00 $/année/pc + TPS/TVQ")} Genre de propriété Commerciale Année de construction Date de livraison prévue ${footer}`),
  residentialRental: document(`${header("91000008", "En vigueur", "80 Rue Locative", "6 500 $/mois X 12 mois")} Genre de propriété Maison à paliers multiples Année de construction Date de livraison prévue 1999 Nbre pièces 2+1 Nbre salles de bains + salles d'eau 4+2 Nbre chambres (hors-sol + sous-sol) 20 ${footer}`),
  soldWithPromiseDate: document(`${header("91000009", "Vendu en 25 jours", "90 Av. Vendue", "527 000 $")} Genre de propriété Appartement Année de construction Date de livraison prévue 1922 Date PA acceptée 2026-04-21 Date de levée des conditions 2026-05-22 2026-08-20 à 10h00 ${footer}`),
  intergenerational: document(`${header("91000010", "En vigueur", "100 Rue Familiale", "599 000 $")} Genre de propriété Maison de plain-pied Année de construction Date de livraison prévue 1978 Intergénération Oui Pièce(s) et Espace(s) additionnel(s) - Intergénération Revenus supplémentaires 700 $ Loyer mensuel ${footer}`),
  saintSauveur: document(`${header("14262312", "En vigueur", "146 Ch. Legault", "869 000 $", "J0R 1R7", "Saint-Sauveur", "ch. Sinclair")} Genre de propriété Maison à étages Année de construction Date de livraison prévue 2004 ${footer}`),
  civicSuffix: document(`${header("16356100", "En vigueur", "64Z Rue Adélard", "549 000 $", "J7P 5J6", "Saint-Eustache")} Genre de propriété Maison de plain-pied Année de construction Date de livraison prévue 1987 ${footer}`),
} as const;
