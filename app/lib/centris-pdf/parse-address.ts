import type { CentrisParseResult } from "./types";

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
  nearby: "",
};

function cleanCityTail(raw: string) {
  return raw.replace(/\s+/g, " ").trim();
}

function parseCityAndContext(raw: string, region: string) {
  const tail = cleanCityTail(raw);
  if (/^Montréal\b/i.test(tail)) {
    const neighborhood = /Montréal\s*\(([^)]+)\)/i.exec(tail)?.[1] ?? "";
    return { city: "Montréal", neighborhood, nearby: tail.replace(/^Montréal(?:\s*\([^)]+\))?\s*/i, "").trim() };
  }
  const knownCity = /^(Blainville|Laval|Boisbriand|Mirabel|Deux-Montagnes|Sainte-Thérèse|Saint-Eustache|Ville-Test)\b/i.exec(tail)?.[1];
  if (knownCity) {
    return { city: knownCity, neighborhood: "", nearby: tail.slice(knownCity.length).trim() };
  }
  const marker = /\s+(?:(?:Nord|Sud|Est|Ouest)(?:\s|$)|(?:Entre|Boul\.?|Rue|Curé|Chanaz|Ernest)(?:\s|$))/i.exec(tail);
  const city = (marker ? tail.slice(0, marker.index) : tail).trim();
  const nearby = marker ? tail.slice(marker.index).trim() : "";
  return { city: city || (region === "Montréal" ? "Montréal" : ""), neighborhood: "", nearby };
}

export function parseCentrisAddress(firstPage: string): CentrisParseResult["address"] {
  const header = /\b\d{7,9}\s*\([^)]{2,80}\)\s*No\s+Centris\s+(.+?)\s+Région\s+Quartier\s+Près de\s+(.+?)(?=\d[\d\s]*(?:[,.]\d+)?\s*\$)/i.exec(firstPage);
  const fallback = /No\s+Centris\s+\d{7,9}\s*(?:\([^)]*\))?\s+(.+?)\s+Région\b/i.exec(firstPage);
  const rawAddress = (header?.[1] ?? fallback?.[1] ?? "").trim();
  if (!rawAddress) return { ...emptyAddress };

  const postalMatch = /\b([A-Z]\d[A-Z]\s*\d[A-Z]\d)\b\s+(.+?)(?=(?:Genre de propriété|Genre\b|Année de construction|Reprise\/Contrôle))/i.exec(firstPage);
  const postalCode = postalMatch?.[1]?.replace(/\s+/g, " ").toUpperCase() ?? "";
  const context = postalMatch?.[2]?.replace(/Voir toutes les photos/gi, "").trim() ?? "";
  const regionSegment = header?.[2] ?? "";
  const region = /\b(Montréal|Laurentides|Laval|Montérégie|Lanaudière|Outaouais|Estrie|Capitale-Nationale)\b/i.exec(regionSegment)?.[1] ?? "";
  const { city, neighborhood, nearby } = parseCityAndContext(context, region);

  const civicNumber = /^(\d+(?:-\d+)?)/.exec(rawAddress)?.[1] ?? "";
  const unitMatch = /,\s*(?:app\.?|appt\.?|local|unité)\s*([\p{L}\p{N}-]+)/iu.exec(rawAddress);
  const street = rawAddress
    .replace(/^\d+(?:-\d+)?\s*/, "")
    .replace(/,\s*(?:app\.?|appt\.?|local|unité)\s*[\p{L}\p{N}-]+\s*$/iu, "")
    .trim();
  const province = postalCode ? "QC" : "";
  const fullAddress = [rawAddress, city, [province, postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    fullAddress,
    civicNumber,
    street,
    unit: unitMatch?.[1] ?? "",
    city,
    province,
    postalCode,
    region,
    neighborhood,
    nearby,
  };
}
