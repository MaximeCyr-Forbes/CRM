import type { CentrisParseResult } from "./types";

const CIVIC_NUMBER_PATTERN = String.raw`\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?`;
const CIVIC_NUMBER_AT_START = new RegExp(`^(${CIVIC_NUMBER_PATTERN})(?=\\s|$)`, "u");
const POSTAL_CODE_PATTERN = /\b([A-Z]\d[A-Z]\s*\d[A-Z]\d)\b/iu;
const FORBIDDEN_GEOGRAPHY_LABEL_PATTERN = String.raw`(?:Région|Quartier|Près\s+de|Plan\s+d[’']eau)`;
const FORBIDDEN_GEOGRAPHY_LABEL = new RegExp(`\\b${FORBIDDEN_GEOGRAPHY_LABEL_PATTERN}\\b\\s*:?`, "iu");
const FORBIDDEN_GEOGRAPHY_LABELS = new RegExp(`\\b${FORBIDDEN_GEOGRAPHY_LABEL_PATTERN}\\b\\s*:?`, "giu");
const ADDRESS_END = new RegExp(
  String.raw`\b${FORBIDDEN_GEOGRAPHY_LABEL_PATTERN}\b\s*:?|\d[\d\s]*(?:[,.]\d+)?\s*\$|\b(?:Genre de propriété|Genre|Année de construction|Reprise\/Contrôle)\b`,
  "iu",
);
const CITY_AT_START = /^([\p{L}]+(?:[’'][\p{L}]+)*(?:-[\p{L}]+(?:[’'][\p{L}]+)*)*)\b/u;
const CITY_AT_END = /([\p{L}]+(?:[’'][\p{L}]+)*(?:-[\p{L}]+(?:[’'][\p{L}]+)*)*)\s*$/u;

const emptyAddress: CentrisParseResult["address"] = {
  fullAddress: "",
  civicNumber: "",
  street: "",
  unit: "",
  city: "",
  province: "",
  postalCode: "",
};

function cleanText(raw: string) {
  return raw.replace(/\s+/g, " ").trim();
}

function resetAndExec(pattern: RegExp, value: string) {
  pattern.lastIndex = 0;
  return pattern.exec(value);
}

function addressStart(firstPage: string) {
  const standard = /\b\d{7,9}\s*\([^)]{2,80}\)\s*No\s+Centris\s+/iu.exec(firstPage);
  if (standard) return standard.index + standard[0].length;
  const reversed = /\bNo\s+Centris\s+\d{7,9}\s*(?:\([^)]{2,80}\))?\s*/iu.exec(firstPage);
  return reversed ? reversed.index + reversed[0].length : -1;
}

function postalStreetBlock(firstPage: string) {
  const start = addressStart(firstPage);
  if (start < 0) return "";
  const remainder = firstPage.slice(start);
  const end = resetAndExec(ADDRESS_END, remainder);
  return cleanText(end ? remainder.slice(0, end.index) : remainder);
}

function splitCivicNumber(rawAddress: string) {
  const match = CIVIC_NUMBER_AT_START.exec(rawAddress);
  const civicNumber = match?.[1] ?? "";
  return {
    civicNumber,
    streetAndUnit: civicNumber ? rawAddress.slice(civicNumber.length).trimStart() : rawAddress,
  };
}

function lastForbiddenLabelIndex(raw: string) {
  let lastIndex = -1;
  for (const match of raw.matchAll(FORBIDDEN_GEOGRAPHY_LABELS)) lastIndex = match.index;
  return lastIndex;
}

function cityAfterPostal(firstPage: string, postalIndex: number, postalLength: number) {
  const beforePostal = firstPage.slice(0, postalIndex);
  const forbiddenIndex = lastForbiddenLabelIndex(beforePostal);
  const priceBoundary = beforePostal.lastIndexOf("$");
  if (forbiddenIndex >= 0 && priceBoundary < forbiddenIndex) return "";

  const afterPostal = cleanText(firstPage.slice(postalIndex + postalLength))
    .replace(/^(?:QC|Québec)\b\s*/iu, "");
  if (!afterPostal || resetAndExec(FORBIDDEN_GEOGRAPHY_LABEL, afterPostal)?.index === 0) return "";
  return CITY_AT_START.exec(afterPostal)?.[1] ?? "";
}

function cityBeforePostal(firstPage: string, postalIndex: number) {
  const beforePostal = firstPage.slice(0, postalIndex);
  const forbiddenIndex = lastForbiddenLabelIndex(beforePostal);
  const priceBoundary = beforePostal.lastIndexOf("$");
  if (forbiddenIndex >= 0 && priceBoundary < forbiddenIndex) return "";
  const safeTail = cleanText(beforePostal.slice(Math.max(priceBoundary + 1, forbiddenIndex < 0 ? 0 : forbiddenIndex + 1)));
  return CITY_AT_END.exec(safeTail)?.[1] ?? "";
}

function splitStreetBlock(rawBlock: string) {
  const postal = POSTAL_CODE_PATTERN.exec(rawBlock);
  if (!postal) return { rawAddress: rawBlock, city: "", postalCode: "" };

  const beforePostal = cleanText(rawBlock.slice(0, postal.index));
  const comma = beforePostal.lastIndexOf(",");
  const afterComma = comma >= 0 ? cleanText(beforePostal.slice(comma + 1)) : "";
  if (comma >= 0 && !/^(?:app\.?|appt\.?|local|unité)\b/iu.test(afterComma)) {
    return {
      rawAddress: cleanText(beforePostal.slice(0, comma)),
      city: afterComma,
      postalCode: postal[1].replace(/\s+/g, " ").toUpperCase(),
    };
  }

  const city = CITY_AT_END.exec(beforePostal)?.[1] ?? "";
  return {
    rawAddress: city ? cleanText(beforePostal.slice(0, beforePostal.length - city.length)) : beforePostal,
    city,
    postalCode: postal[1].replace(/\s+/g, " ").toUpperCase(),
  };
}

export function parseCentrisAddress(firstPage: string): CentrisParseResult["address"] {
  const streetBlock = splitStreetBlock(postalStreetBlock(firstPage));
  const rawAddress = streetBlock.rawAddress;
  if (!rawAddress) return { ...emptyAddress };

  const postalMatch = POSTAL_CODE_PATTERN.exec(firstPage);
  const postalCode = streetBlock.postalCode
    || postalMatch?.[1]?.replace(/\s+/g, " ").toUpperCase()
    || "";
  const city = cleanText(
    streetBlock.city
      || (postalMatch ? cityAfterPostal(firstPage, postalMatch.index, postalMatch[0].length) : "")
      || (postalMatch ? cityBeforePostal(firstPage, postalMatch.index) : ""),
  );

  const { civicNumber, streetAndUnit } = splitCivicNumber(rawAddress);
  const unitMatch = /,\s*(?:app\.?|appt\.?|local|unité)\s*([\p{L}\p{N}-]+)/iu.exec(rawAddress);
  const street = streetAndUnit
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
  };
}
