import type {
  FieldConfidence,
  IncomePropertyData,
  ParsedProperty,
  PropertyData,
  PropertyListingStatus,
} from "@/app/lib/tools/acm/types";
import { categorizeProperty } from "./categorize";
import {
  extractCentrisNumber,
  extractLabeledValue,
  extractPostalCode,
  extractSection,
  extractStrictStreetAddress,
  getTextLines,
  parseArea,
  parseCount,
  parseDimensions,
  parseFrenchDate,
  parseInteger,
  parseList,
  parseMoney,
  parseParkingCount,
} from "./extractors";
import { CENTRIS_FIELD_LABELS, CENTRIS_SECTION_LABELS } from "./field-labels";
import { normalizePdfText, normalizeSearchText } from "./normalization";
import type { PdfParseMetadata } from "./parser-types";

const ALL_FIELD_LABELS = Object.values(CENTRIS_FIELD_LABELS).flat();

function detectStatus(value?: string): PropertyListingStatus | undefined {
  if (!value) return undefined;
  const normalized = normalizeSearchText(value);
  if (/\bvendu(?:e)?\b/.test(normalized)) return "sold";
  if (/\b(?:en vigueur|active?|a vendre)\b/.test(normalized)) return "active";
  if (/\bexpiree?\b/.test(normalized)) return "expired";
  if (/\b(?:retiree?|suspendue?|annulee?)\b/.test(normalized)) return "withdrawn";
  return undefined;
}

function calculateOverallConfidence(confidences: Record<string, FieldConfidence>): FieldConfidence {
  const values = Object.values(confidences);
  if (values.length < 3) return "low";
  const score = values.reduce((sum, item) => sum + ({ high: 3, medium: 2, low: 1 }[item]), 0) / values.length;
  if (score >= 2.55 && values.length >= 6) return "high";
  if (score >= 1.7) return "medium";
  return "low";
}

function sectionBetween(lines: readonly string[], startPattern: RegExp, endPattern: RegExp): string[] {
  const start = lines.findIndex((line) => startPattern.test(normalizeSearchText(line)));
  if (start < 0) return [];
  const relativeEnd = lines.slice(start + 1).findIndex((line) => endPattern.test(normalizeSearchText(line)));
  return lines.slice(start, relativeEnd < 0 ? lines.length : start + 1 + relativeEnd);
}

function labeledValue(lines: readonly string[], key: keyof typeof CENTRIS_FIELD_LABELS): string | undefined {
  return extractLabeledValue(lines, CENTRIS_FIELD_LABELS[key], ALL_FIELD_LABELS);
}

function parseCountPair(value?: string): { first: number; second: number } | undefined {
  const match = value?.match(/\b(\d+)\s*\+\s*(\d+)\b/);
  return match ? { first: Number(match[1]), second: Number(match[2]) } : undefined;
}

function appendKnownContinuation(lines: readonly string[], label: string, value?: string): string | undefined {
  if (!value) return undefined;
  const index = lines.findIndex((line) => normalizeSearchText(line).startsWith(normalizeSearchText(label)));
  const continuation = lines[index + 1]?.trim();
  if (index < 0 || !continuation || continuation.includes("\t")) return value;
  if (!/^(?:aménagé|amenage|électriques?|electriques?)$/iu.test(continuation)) return value;
  return `${value} ${continuation}`;
}

function extractHeatPump(lines: readonly string[]): string | undefined {
  const index = lines.findIndex((line) => /thermopompe/iu.test(line));
  if (index < 0) return undefined;
  const neighborhood = lines.slice(index, index + 3).join(" ");
  const match = neighborhood.match(/thermopompe(?:\s+murale)?/iu);
  if (!match) return undefined;
  return /murale/iu.test(neighborhood) ? "Thermopompe murale" : match[0];
}

function extractHeader(lines: readonly string[]) {
  const centrisIndex = lines.findIndex((line) => /\bno centris\b/.test(normalizeSearchText(line)));
  const detailsIndex = lines.findIndex((line, index) => index > centrisIndex && /genre de propriete/.test(normalizeSearchText(line)));
  const header = centrisIndex >= 0 ? lines.slice(centrisIndex, detailsIndex > centrisIndex ? detailsIndex : centrisIndex + 30) : lines.slice(0, 40);
  const address = extractStrictStreetAddress(header);
  const addressIndex = address ? header.findIndex((line) => line.startsWith(address)) : -1;
  const afterAddress = addressIndex >= 0 ? header.slice(addressIndex + 1, addressIndex + 6) : [];
  const city = afterAddress.find((line) => /^[\p{L}][\p{L}'’ .-]{1,60}$/u.test(line) && !extractPostalCode(line));
  const postalCode = extractPostalCode(afterAddress.join(" "));
  const mainPriceText = header.find((line) => /^\s*\d[\d\s.,]*\s*\$\s*$/.test(line));
  const centrisHeader = header.find((line) => /\bno centris\b/.test(normalizeSearchText(line)));

  return { header, address, city, postalCode, mainPriceText, centrisHeader };
}

export function parseCentrisText(rawText: string, metadata: PdfParseMetadata): ParsedProperty {
  const text = normalizePdfText(rawText);
  const lines = getTextLines(text);
  const data: PropertyData = { sourceFile: metadata.sourceFile };
  const rawFields: Record<string, string | undefined> = {};
  const fieldConfidence: Record<string, FieldConfidence> = {};
  const warnings: string[] = [];

  function remember(key: string, value?: string) {
    if (value) rawFields[key] = value;
    return value;
  }

  function assign<K extends keyof PropertyData>(key: K, value: PropertyData[K], confidence: FieldConfidence = "high") {
    if (value === undefined || value === null || value === "") return;
    data[key] = value;
    fieldConfidence[key] = confidence;
  }

  const header = extractHeader(lines);
  const centrisLabeled = remember("centrisNumber", labeledValue(header.header, "centrisNumber"));
  assign("centrisNumber", extractCentrisNumber(text, centrisLabeled), centrisLabeled ? "high" : "medium");

  const labeledStatus = remember("status", labeledValue(lines, "status"));
  const statusSource = labeledStatus ?? header.centrisHeader;
  const status = detectStatus(statusSource);
  assign("status", status, labeledStatus ? "high" : "medium");
  const daysMatch = header.centrisHeader?.match(/vendu(?:e)?\s+en\s+(\d+)\s+jours?/iu);
  const labeledDays = remember("daysOnMarket", labeledValue(lines, "daysOnMarket"));
  assign("daysOnMarket", labeledDays ? parseInteger(labeledDays) : daysMatch ? Number(daysMatch[1]) : undefined, labeledDays ? "high" : "medium");

  const labeledAddress = remember("address", labeledValue(lines, "address"));
  assign("address", labeledAddress ?? header.address, labeledAddress ? "high" : "medium");
  const labeledCity = remember("city", labeledValue(header.header, "city"));
  assign("city", labeledCity ?? header.city, labeledCity ? "high" : "medium");
  const labeledPostal = remember("postalCode", labeledValue(lines, "postalCode"));
  assign("postalCode", extractPostalCode(labeledPostal) ?? header.postalCode, labeledPostal ? "high" : "medium");
  assign("region", remember("region", labeledValue(lines, "region")));
  assign("neighborhood", remember("neighborhood", labeledValue(lines, "neighborhood")));
  assign("near", remember("near", labeledValue(lines, "near")));

  const propertyType = remember("propertyType", labeledValue(lines, "propertyType"));
  const buildingType = remember("buildingType", labeledValue(lines, "buildingType"));
  assign("propertyType", propertyType);
  assign("buildingType", buildingType);
  const category = categorizeProperty(propertyType, buildingType, text);
  assign("propertyCategory", category.category, category.confidence);
  if (!category.category) warnings.push("La catégorie n'a pas pu être déterminée sans ambiguïté.");

  const explicitAskingPrice = remember("askingPrice", labeledValue(lines, "askingPrice"));
  const explicitSoldPrice = remember("soldPrice", labeledValue(lines, "soldPrice"));
  const mainPrice = parseMoney(remember("mainPrice", header.mainPriceText));
  assign("askingPrice", parseMoney(explicitAskingPrice) ?? (status === "active" ? mainPrice : undefined), explicitAskingPrice ? "high" : "medium");
  assign("soldPrice", parseMoney(explicitSoldPrice) ?? (status === "sold" ? mainPrice : undefined), explicitSoldPrice ? "high" : "medium");
  assign("dateSold", parseFrenchDate(remember("dateSold", labeledValue(lines, "dateSold"))));
  assign("yearBuilt", parseInteger(remember("yearBuilt", labeledValue(lines, "yearBuilt"))));

  assign("buildingDimensions", parseDimensions(remember("buildingDimensions", labeledValue(lines, "buildingDimensions"))));
  assign("buildingArea", parseArea(remember("buildingArea", labeledValue(lines, "buildingArea"))));
  assign("landDimensions", parseDimensions(remember("landDimensions", labeledValue(lines, "landDimensions"))));
  assign("landArea", parseArea(remember("landArea", labeledValue(lines, "landArea"))));
  assign("cadastre", remember("cadastre", labeledValue(lines, "cadastre")));
  assign("zoning", parseList(remember("zoning", labeledValue(lines, "zoning"))));

  const assessmentLines = sectionBetween(lines, /^evaluation \(municipale\)/, /^piece\(s\)/);
  const assessmentYearRaw = remember("municipalAssessment.year", assessmentLines.length > 0
    ? extractLabeledValue(assessmentLines, ["Année"], ["Municipale", "Terrain"])
    : labeledValue(lines, "assessmentYear"));
  const assessmentLandRaw = remember("municipalAssessment.land", assessmentLines.length > 0
    ? extractLabeledValue(assessmentLines, ["Terrain"], ["Scolaire", "Bâtiment"])
    : labeledValue(lines, "assessmentLand"));
  const assessmentBuildingRaw = remember("municipalAssessment.building", assessmentLines.length > 0
    ? extractLabeledValue(assessmentLines, ["Bâtiment"], ["Secteur", "Total"])
    : labeledValue(lines, "assessmentBuilding"));
  const assessmentTotalRaw = remember("municipalAssessment.total", assessmentLines.length > 0
    ? extractLabeledValue(assessmentLines, ["Total"], ["Total"])
    : labeledValue(lines, "assessmentTotal"));
  const assessment = {
    year: parseInteger(assessmentYearRaw),
    land: parseMoney(assessmentLandRaw),
    building: parseMoney(assessmentBuildingRaw),
    total: parseMoney(assessmentTotalRaw),
  };
  if (Object.values(assessment).some((value) => value !== undefined)) assign("municipalAssessment", assessment);
  assign("municipalTaxes", parseMoney(remember("municipalTaxes", extractLabeledValue(assessmentLines, ["Municipale"], ["Frais communs"]))));
  assign("schoolTaxes", parseMoney(remember("schoolTaxes", extractLabeledValue(assessmentLines, ["Scolaire"], ["Secteur"]))));

  const roomLines = sectionBetween(lines, /^piece\(s\)/, /^niveau\b/);
  const roomSource = roomLines.length > 0 ? roomLines : lines;
  const roomsRaw = remember("rooms", extractLabeledValue(roomSource, ["Nbre pièces", "Nombre de pièces"], ALL_FIELD_LABELS));
  const bedroomsRaw = remember("bedrooms", extractLabeledValue(roomSource, ["Nbre chambres (hors-sol + sous-sol)", ...CENTRIS_FIELD_LABELS.bedrooms], ALL_FIELD_LABELS));
  const bathroomsRaw = remember("bathrooms", extractLabeledValue(roomSource, ["Nbre salles de bains + salles d'eau", ...CENTRIS_FIELD_LABELS.bathrooms], ALL_FIELD_LABELS));
  const bedroomPair = parseCountPair(bedroomsRaw);
  const bathroomPair = parseCountPair(bathroomsRaw);
  assign("rooms", parseInteger(roomsRaw));
  assign("bedroomsAboveGround", bedroomPair?.first);
  assign("bedroomsBasement", bedroomPair?.second);
  assign("bedroomsTotal", bedroomPair ? bedroomPair.first + bedroomPair.second : parseCount(bedroomsRaw));
  assign("bathrooms", bathroomPair?.first ?? parseCount(bathroomsRaw));
  assign("powderRooms", bathroomPair?.second ?? parseCount(remember("powderRooms", labeledValue(lines, "powderRooms"))));

  const extractedCharacteristicLines = sectionBetween(lines, /^caracteristiques$/, /^inclusions$/);
  const characteristicLines = extractedCharacteristicLines.length > 0 ? extractedCharacteristicLines : lines;
  const basement = appendKnownContinuation(characteristicLines, "Sous-sol", remember("basement", labeledValue(characteristicLines, "basement")));
  const heating = appendKnownContinuation(characteristicLines, "Mode chauffage", remember("heating", labeledValue(characteristicLines, "heating")));
  assign("parking", parseParkingCount(remember("parking", extractLabeledValue(characteristicLines, ["Stat. (total)", ...CENTRIS_FIELD_LABELS.parking], ALL_FIELD_LABELS))));
  assign("garage", remember("garage", labeledValue(characteristicLines, "garage")));
  assign("pool", remember("pool", labeledValue(characteristicLines, "pool")));
  assign("basement", basement);
  assign("foundation", remember("foundation", labeledValue(characteristicLines, "foundation")));
  assign("roof", remember("roof", labeledValue(characteristicLines, "roof")));
  assign("heatingEnergy", remember("heatingEnergy", labeledValue(characteristicLines, "heatingEnergy")));
  assign("heating", parseList(heating));
  assign("heatPump", remember("heatPump", extractHeatPump(characteristicLines)), "medium");
  assign("waterSupply", remember("waterSupply", labeledValue(characteristicLines, "waterSupply")));
  assign("sewageSystem", remember("sewageSystem", labeledValue(characteristicLines, "sewageSystem")));

  const remarks = extractSection(lines, CENTRIS_SECTION_LABELS.remarks, CENTRIS_SECTION_LABELS.stops);
  const addendum = extractSection(lines, CENTRIS_SECTION_LABELS.addendum, CENTRIS_SECTION_LABELS.stops);
  assign("remarks", remarks);
  assign("description", remarks);
  assign("addendum", addendum);

  const incomeProperty: IncomePropertyData = {
    numberOfUnits: parseInteger(remember("numberOfUnits", labeledValue(lines, "numberOfUnits"))),
    residentialRevenue: parseMoney(remember("residentialRevenue", labeledValue(lines, "residentialRevenue"))),
    commercialRevenue: parseMoney(remember("commercialRevenue", labeledValue(lines, "commercialRevenue"))),
    grossPotentialRevenue: parseMoney(remember("grossPotentialRevenue", labeledValue(lines, "grossPotentialRevenue"))),
    operatingExpenses: parseMoney(remember("operatingExpenses", labeledValue(lines, "operatingExpenses"))),
    netOperatingIncome: parseMoney(remember("netOperatingIncome", labeledValue(lines, "netOperatingIncome"))),
    grossRevenueMultiplier: parseMoney(remember("grossRevenueMultiplier", labeledValue(lines, "grossRevenueMultiplier"))),
    pricePerDoor: parseMoney(remember("pricePerDoor", labeledValue(lines, "pricePerDoor"))),
  };
  const otherStatistics = {
    capitalizationRate: parseMoney(remember("capitalizationRate", labeledValue(lines, "capitalizationRate"))),
    expenseRatio: parseMoney(remember("expenseRatio", labeledValue(lines, "expenseRatio"))),
    pricePerSquareFoot: parseMoney(remember("pricePerSquareFoot", labeledValue(lines, "pricePerSquareFoot"))),
  };
  const detectedOtherStatistics = Object.fromEntries(Object.entries(otherStatistics).filter(([, value]) => value !== undefined)) as Record<string, number>;
  if (Object.keys(detectedOtherStatistics).length > 0) incomeProperty.otherStatistics = detectedOtherStatistics;
  const rents = remember("rents", labeledValue(lines, "rents"));
  if (rents) incomeProperty.rents = [{ notes: rents }];
  if (Object.values(incomeProperty).some((value) => value !== undefined)) assign("incomeProperty", incomeProperty);

  const detectedImageCount = metadata.detectedImageCount ?? 0;
  assign("photoDetection", {
    detected: detectedImageCount > 0,
    count: detectedImageCount || undefined,
    extractionSupported: true,
  }, detectedImageCount > 0 ? "medium" : "low");

  if (!text) warnings.push("Aucun texte exploitable n'a été détecté dans ce PDF.");
  if (detectedImageCount > 0) warnings.push("Des visuels ont été détectés; leur extraction complète sera raffinée ultérieurement.");

  return {
    id: metadata.id,
    sourceFile: metadata.sourceFile,
    sourceType: "pdf",
    documentType: "centris",
    data,
    fieldConfidence,
    overallConfidence: calculateOverallConfidence(fieldConfidence),
    pageCount: metadata.pageCount,
    warnings,
    ...(metadata.includeDebug ? {
      debug: {
        rawPdfText: rawText,
        parsedProperty: rawFields,
        normalizedProperty: structuredClone(data),
      },
    } : {}),
  };
}
