import type { CentrisParseResult } from "./types";

const QUEBEC_REGIONS = [
  "Bas-Saint-Laurent",
  "Saguenay-Lac-Saint-Jean",
  "Capitale-Nationale",
  "Mauricie",
  "Estrie",
  "Montréal",
  "Outaouais",
  "Abitibi-Témiscamingue",
  "Côte-Nord",
  "Nord-du-Québec",
  "Gaspésie-Îles-de-la-Madeleine",
  "Chaudière-Appalaches",
  "Laval",
  "Lanaudière",
  "Laurentides",
  "Montérégie",
  "Centre-du-Québec",
] as const;

const emptyAddress: CentrisParseResult["address"] = {
  fullAddress: "",
  civicNumber: "",
  street: "",
  unit: "",
  city: "",
  province: "",
  postalCode: "",
  region: "",
  neighborhood: "",
};

function cleanText(raw: string) {
  return raw.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function valuePattern(value: string) {
  return value.split(/\s+/).map(escapeRegExp).join("\\s+");
}

function removeTrailingValue(raw: string, value: string) {
  if (!value) return cleanText(raw);
  return cleanText(raw).replace(new RegExp(`(?:^|\\s+)${valuePattern(value)}\\s*$`, "iu"), "").trim();
}

function removeTrailingSegmentStartingWith(raw: string, value: string) {
  if (!value) return cleanText(raw);
  return cleanText(raw).replace(new RegExp(`(?:^|\\s+)${valuePattern(value)}(?:\\s+.*)?$`, "iu"), "").trim();
}

function detectedRegion(raw: string) {
  const normalized = cleanText(raw);
  return QUEBEC_REGIONS.find((region) => new RegExp(`(?:^|\\s)${valuePattern(region)}(?:\\s|$)`, "iu").test(normalized)) ?? "";
}

function explicitNeighborhood(metadata: string) {
  const value = /\bQuartier\b\s*(.*?)\s*\bPrès\s+de\b/iu.exec(metadata)?.[1] ?? "";
  return cleanText(value);
}

function ignoredProximityText(metadata: string, region: string, neighborhood: string) {
  const valueAfterDelimiter = /\bPrès\s+de\b\s*(.*)$/iu.exec(metadata)?.[1] ?? "";
  return removeTrailingValue(removeTrailingValue(valueAfterDelimiter, region), neighborhood);
}

function parseCityAndContext(raw: string, region: string, explicitDistrict: string, ignoredProximity: string) {
  let cityContext = cleanText(raw);
  cityContext = removeTrailingSegmentStartingWith(cityContext, ignoredProximity);
  cityContext = removeTrailingValue(cityContext, region);
  cityContext = removeTrailingValue(cityContext, explicitDistrict);

  const parenthesizedDistrict = /^(.+?)\s*\(([^)]+)\)\s*$/u.exec(cityContext);
  if (parenthesizedDistrict) {
    return {
      city: cleanText(parenthesizedDistrict[1]),
      neighborhood: explicitDistrict || cleanText(parenthesizedDistrict[2]),
    };
  }

  return {
    city: cityContext || (region === "Montréal" ? "Montréal" : ""),
    neighborhood: explicitDistrict,
  };
}

export function parseCentrisAddress(firstPage: string): CentrisParseResult["address"] {
  const header = /\b\d{7,9}\s*\([^)]{2,80}\)\s*No\s+Centris\s+(.+?)\s+Région\b/i.exec(firstPage);
  const fallback = /No\s+Centris\s+\d{7,9}\s*(?:\([^)]*\))?\s+(.+?)\s+Région\b/i.exec(firstPage);
  const rawAddress = cleanText(header?.[1] ?? fallback?.[1] ?? "");
  if (!rawAddress) return { ...emptyAddress };

  const postalMatch = /\b([A-Z]\d[A-Z]\s*\d[A-Z]\d)\b\s+(.+?)(?=(?:Genre de propriété|Genre\b|Année de construction|Reprise\/Contrôle))/i.exec(firstPage);
  const postalCode = postalMatch?.[1]?.replace(/\s+/g, " ").toUpperCase() ?? "";
  const context = postalMatch?.[2]?.replace(/Voir toutes les photos/gi, "").trim() ?? "";
  const metadata = /\bRégion\b\s*(.*?)(?=\d[\d\s]*(?:[,.]\d+)?\s*\$)/iu.exec(firstPage)?.[1] ?? "";
  const region = detectedRegion(metadata);
  const neighborhood = explicitNeighborhood(metadata);
  const ignoredProximity = ignoredProximityText(metadata, region, neighborhood);
  const cityAndContext = parseCityAndContext(context, region, neighborhood, ignoredProximity);

  const civicNumber = /^(\d+(?:-\d+)?)/.exec(rawAddress)?.[1] ?? "";
  const unitMatch = /,\s*(?:app\.?|appt\.?|local|unité)\s*([\p{L}\p{N}-]+)/iu.exec(rawAddress);
  const street = rawAddress
    .replace(/^\d+(?:-\d+)?\s*/, "")
    .replace(/,\s*(?:app\.?|appt\.?|local|unité)\s*[\p{L}\p{N}-]+\s*$/iu, "")
    .trim();
  const province = postalCode ? "QC" : "";
  const fullAddress = [rawAddress, cityAndContext.city, [province, postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    fullAddress,
    civicNumber,
    street,
    unit: unitMatch?.[1] ?? "",
    city: cityAndContext.city,
    province,
    postalCode,
    region,
    neighborhood: cityAndContext.neighborhood,
  };
}
