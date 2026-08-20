import { parseMoney } from "./parse-price";
import type { CentrisParseResult, CentrisPropertyType } from "./types";

function normalizeArea(raw: string | undefined) {
  if (!raw) return null;
  const value = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? Math.round(value) : null;
}

export function normalizePropertyType(genreRaw: string): CentrisPropertyType {
  const genre = genreRaw.toLocaleLowerCase("fr-CA");
  if (/terrain/.test(genre)) return "land";
  if (/appartement|copropriété|condo/.test(genre)) return "condo";
  if (/duplex|triplex|quadruplex|quintuplex|multiplex|immeuble à revenus?/.test(genre)) return "income_property";
  if (/commercial|commerce|bureau|industriel/.test(genre)) return "commercial";
  if (/maison|plain-pied|étages|paliers multiples|mobile|fermette|unifamiliale/.test(genre)) return "residential";
  return "other";
}

function extractGenre(text: string) {
  const explicit = /Genre de propriété\s+(.+?)\s+Année de construction/i.exec(text)?.[1]?.trim();
  if (explicit) return explicit;
  if (/\bTerrain\b[\s\S]{0,160}\bSuperficie du terrain\b/i.test(text)) return "Terrain";
  return "";
}

function firstYearAfter(text: string, label: RegExp) {
  const match = label.exec(text);
  if (!match) return null;
  const year = /\b(18\d{2}|19\d{2}|20\d{2})\b/.exec(text.slice(match.index + match[0].length, match.index + match[0].length + 650));
  return year ? Number(year[1]) : null;
}

function parseRoomSummary(text: string) {
  const match = /Nbre pièces\s+(\d+)\+(\d+)\s+Nbre salles de bains \+ salles d'eau\s+(\d+)\+(\d+)\s+Nbre chambres \(hors-sol \+ sous-sol\)\s+(\d+)/i.exec(text);
  if (!match) return { rooms: null, bedroomsAbove: null, bedroomsBasement: null, bathrooms: null, powderRooms: null };
  return {
    rooms: Number(match[5]),
    bedroomsAbove: Number(match[3]),
    bedroomsBasement: Number(match[4]),
    bathrooms: Number(match[1]),
    powderRooms: Number(match[2]),
  };
}

function amountAroundLabel(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const before = new RegExp(`(\\d[\\d\\s]*)\\s*\\$\\s*(?:\\(\\d{4}\\))?\\s*${escaped}`, "i").exec(text)?.[1];
  const after = new RegExp(`${escaped}(?:\\s*\\(\\d{4}\\))?\\s*(\\d[\\d\\s]*)\\s*\\$`, "i").exec(text)?.[1];
  return parseMoney(before ?? after);
}

export function parseCentrisProperty(text: string): {
  property: CentrisParseResult["property"];
  financial: CentrisParseResult["financial"];
  rentalUnits: CentrisParseResult["rentalUnits"];
} {
  const genreRaw = extractGenre(text);
  const rooms = parseRoomSummary(text);
  const landArea = /([\d\s]+(?:[,.]\d+)?)\s*(?:pc|pi\s*[²2])\s+Superficie du terrain/i.exec(text)?.[1];
  const buildingArea = /([\d\s]+(?:[,.]\d+)?)\s*(?:pc|pi\s*[²2])\s+Superficie du bâtiment/i.exec(text)?.[1];
  const availableArea = /Superficie disponible(?:\s+de)?\s+([\d\s]+(?:[,.]\d+)?)\s*(?:pc|pi\s*[²2])/i.exec(text)?.[1];
  const livingArea = /([\d\s]+(?:[,.]\d+)?)\s*(?:pc|pi\s*[²2])\s+(?:Sup\. habitable|Superficie habitable)/i.exec(text)?.[1];
  const unitCount = /Revenus mensuels \(résidentiel\)\s*-\s*(\d+)\s+unité/i.exec(text)?.[1]
    ?? /Nombre total d'unités[\s\S]{0,120}?\b(\d+)\b/i.exec(text)?.[1];
  const rentalUnits: CentrisParseResult["rentalUnits"] = [];
  const unitSegments = text.split(/(?=Numéro log\. Fin de bail)/i).slice(1);
  for (const segment of unitSegments) {
    const header = /Numéro log\. Fin de bail\s+([\p{L}\p{N}-]+)\s+(\d{4}-\d{2}-\d{2})/iu.exec(segment);
    if (!header) continue;
    const rent = /(\d[\d\s]*)\s*\$\s+Loyer mensuel/i.exec(segment)?.[1];
    const roomCount = /(\d+)\s+Nbre pièces/i.exec(segment)?.[1];
    const bedroomCount = /(\d+)\s+Nbre chambres/i.exec(segment)?.[1];
    const bathCount = /(\d+)\+(\d+)\s+Nbre SDB \+ SE/i.exec(segment);
    rentalUnits.push({
      unitNumber: header[1],
      leaseEndDate: header[2],
      monthlyRent: parseMoney(rent),
      rooms: roomCount ? Number(roomCount) : null,
      bedrooms: bedroomCount ? Number(bedroomCount) : null,
      bathrooms: bathCount ? Number(bathCount[1]) : null,
    });
  }
  return {
    property: {
      genreRaw,
      normalizedType: normalizePropertyType(genreRaw),
      yearBuilt: firstYearAfter(text, /Année de construction/i),
      numberOfUnits: unitCount ? Number(unitCount) : rentalUnits.length || null,
      numberOfRooms: rooms.rooms,
      bedroomsAboveGround: rooms.bedroomsAbove,
      bedroomsBasement: rooms.bedroomsBasement,
      bathrooms: rooms.bathrooms,
      powderRooms: rooms.powderRooms,
      intergenerational: /Intergénération\s+Oui\b/i.test(text) ? true : /Intergénération\s+Non\b/i.test(text) ? false : null,
      livingAreaSqFt: normalizeArea(livingArea),
      buildingAreaSqFt: normalizeArea(buildingArea),
      availableAreaSqFt: normalizeArea(availableArea),
      landAreaSqFt: normalizeArea(landArea),
    },
    financial: {
      municipalTaxesAnnual: amountAroundLabel(text, "Municipale") ?? amountAroundLabel(text, "Taxe municipale"),
      schoolTaxesAnnual: amountAroundLabel(text, "Scolaire") ?? amountAroundLabel(text, "Taxe scolaire"),
      condoFeesMonthly: parseMoney(/Frais de cop\.\s*\((\d[\d\s]*)\s*\$\s*\/\s*mois\)/i.exec(text)?.[1]),
      grossPotentialRevenueAnnual: parseMoney(/Revenus bruts potentiels(?: annuels)?(?:\s*\([^)]*\))?\s+(\d[\d\s]*)\s*\$/i.exec(text)?.[1]),
      netOperatingIncomeAnnual: parseMoney(/Revenus nets d'exploitation\s+(\d[\d\s]*)\s*\$/i.exec(text)?.[1]),
      supplementalRevenueMonthly: parseMoney(/Revenus supplémentaires[\s\S]{0,500}?(\d[\d\s]*)\s*\$[\s\S]{0,80}?Loyer mensuel/i.exec(text)?.[1]),
    },
    rentalUnits,
  };
}
