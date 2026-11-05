import type {
  FieldConfidence,
  IncomePropertyData,
  ParsedProperty,
  PropertyData,
  PropertyTransaction,
} from "@/app/lib/tools/acm/types";
import { categorizeProperty } from "./categorize";
import { detectPropertyDocumentType } from "./document-type";
import { extractPostalCode, getTextLines, parseArea, parseFrenchDate, parseInteger, parseMoney } from "./extractors";
import { normalizePdfText, normalizeSearchText } from "./normalization";
import type { PdfParseMetadata } from "./parser-types";

function calculateOverallConfidence(confidences: Record<string, FieldConfidence>): FieldConfidence {
  const values = Object.values(confidences);
  if (values.length < 3) return "low";
  const score = values.reduce((sum, item) => sum + ({ high: 3, medium: 2, low: 1 }[item]), 0) / values.length;
  if (score >= 2.55 && values.length >= 6) return "high";
  if (score >= 1.7) return "medium";
  return "low";
}

function parseJlrBoolean(value?: string): boolean | undefined {
  if (!value) return undefined;
  const normalized = normalizeSearchText(value);
  if (/^(?:oui|yes)$/.test(normalized)) return true;
  if (/^(?:non|no)$/.test(normalized)) return false;
  return undefined;
}

function extractLabeledLineValue(lines: readonly string[], label: string): string | undefined {
  const normalizedLabel = normalizeSearchText(label);
  const line = lines.find((candidate) => normalizeSearchText(candidate).startsWith(`${normalizedLabel} :`));
  if (!line) return undefined;
  const colon = line.indexOf(":");
  const value = colon >= 0 ? line.slice(colon + 1).trim() : "";
  return value || undefined;
}

function extractHeader(lines: readonly string[]) {
  const headerLine = lines.find((line) => extractPostalCode(line) && /^\d{1,6}\b/.test(line) && /\b(?:rue|avenue|boulevard|chemin|route|rang|place|croissant|montee|montée)\b/iu.test(line));
  const postalCode = extractPostalCode(headerLine)?.replace(/\s/g, "");
  const mrc = extractLabeledLineValue(lines, "MRC");
  if (!headerLine || !postalCode) return { address: undefined, city: undefined, postalCode, mrc };

  const compactPostalPattern = postalCode.split("").join("\\s*");
  const locationLine = lines.find((line) => line !== headerLine
    && new RegExp(`${compactPostalPattern}\\s*$`, "iu").test(line)
    && !/\b(?:rue|avenue|boulevard|chemin|route|rang|place|croissant|montee|montée)\b/iu.test(line));
  const city = locationLine?.replace(new RegExp(`\\s*${compactPostalPattern}\\s*$`, "iu"), "").trim()
    || (mrc && headerLine.includes(mrc) ? mrc : undefined);
  const beforePostal = headerLine.replace(new RegExp(`\\s*${compactPostalPattern}\\s*$`, "iu"), "").trim();
  const address = city && normalizeSearchText(beforePostal).endsWith(normalizeSearchText(city))
    ? beforePostal.slice(0, beforePostal.length - city.length).trim()
    : undefined;

  return { address, city, postalCode, mrc };
}

function extractCurrentAssessment(lines: readonly string[]) {
  const headingIndex = lines.findIndex((line) => normalizeSearchText(line) === "evaluation municipale");
  if (headingIndex < 0) return undefined;
  const row = lines.slice(headingIndex + 1).find((line) => /^\d{4}\s*-\s*\d{4}\t/.test(line));
  if (!row) return undefined;
  const cells = row.split(/\t+/).map((cell) => cell.trim()).filter(Boolean);
  if (cells.length < 4) return undefined;
  const year = parseInteger(cells[0]);
  const land = parseMoney(cells[1]);
  const building = parseMoney(cells[2]);
  const total = parseMoney(cells[3]);
  if ([year, land, building, total].every((value) => value === undefined)) return undefined;
  return { year, land, building, total };
}

function extractTransactions(lines: readonly string[]): PropertyTransaction[] | undefined {
  const transactions: PropertyTransaction[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^Vente(?:\t|$)/iu.test(line)) continue;
    const amount = parseMoney(line.match(/\bMontant\s*:\s*([^\t]+)/iu)?.[1]);
    let date: string | undefined;
    let deedNumber: string | undefined;

    for (const detail of lines.slice(index + 1, index + 5)) {
      if (/^(?:Vente|Hypothèque)(?:\t|$)/iu.test(detail)) break;
      date ??= parseFrenchDate(detail.match(/^Date\s*:\s*([^\t]+)/iu)?.[1]);
      deedNumber ??= detail.match(/^Numéro\s*:\s*(\d+)/iu)?.[1];
    }

    if (date !== undefined || amount !== undefined || deedNumber !== undefined) {
      transactions.push({ date, amount, deedNumber });
    }
  }

  if (transactions.length === 0) return undefined;
  return transactions.sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""));
}

export function parseJlrText(rawText: string, metadata: PdfParseMetadata): ParsedProperty {
  const text = normalizePdfText(rawText);
  const lines = getTextLines(text);
  const data: PropertyData = { sourceFile: metadata.sourceFile };
  const rawFields: Record<string, string | undefined> = {};
  const fieldConfidence: Record<string, FieldConfidence> = {};
  const warnings: string[] = [];

  function assign<K extends keyof PropertyData>(key: K, value: PropertyData[K], confidence: FieldConfidence = "high") {
    if (value === undefined || value === null || value === "") return;
    data[key] = value;
    fieldConfidence[key] = confidence;
  }

  const header = extractHeader(lines);
  assign("address", header.address);
  assign("city", header.city, header.city === header.mrc ? "medium" : "high");
  assign("postalCode", header.postalCode);
  assign("mrc", header.mrc);

  const lotLine = lines.find((line) => /\bLot\s*:\s*Cadastre/iu.test(line));
  const cadastre = lotLine?.match(/\bCadastre(?:\s+Du\s+Quebec|\s+Du\s+Québec)?\s+(\d[\d\s]*)/iu)?.[1]?.replace(/\s/g, "");
  rawFields.cadastre = lotLine;
  assign("cadastre", cadastre);

  const propertyLine = lines.find((line) => /\d+\s+Logement\(s\)/iu.test(line) && /\d+\s+[ÉE]tage\(s\)/iu.test(line));
  const propertyMatch = propertyLine?.match(/^(.+?)\t+(\d+)\s+Logement\(s\)\t+(\d+)\s+[ÉE]tage\(s\)/iu);
  const propertyType = propertyMatch?.[1]?.trim();
  const numberOfUnits = parseInteger(propertyMatch?.[2]);
  assign("propertyType", propertyType);
  assign("numberOfFloors", parseInteger(propertyMatch?.[3]));

  const yearLine = lines.find((line) => /Année construction\s*:/iu.test(line));
  const yearMatch = yearLine?.match(/Année construction\s*:\s*(\d{4})(?:\t+(.+))?/iu);
  const buildingType = yearMatch?.[2]?.trim();
  rawFields.yearBuilt = yearLine;
  assign("yearBuilt", parseInteger(yearMatch?.[1]));
  assign("buildingType", buildingType);

  const category = categorizeProperty(propertyType, buildingType, text);
  assign("propertyCategory", category.category, category.confidence);

  const lotDimensionsLine = lines.find((line) => /Dimension lot\s*:/iu.test(line));
  const floorAreaLine = lines.find((line) => /Aire d['’][ÉEée]tage\s*:/iu.test(line));
  rawFields.landArea = lotDimensionsLine;
  rawFields.buildingArea = floorAreaLine;
  assign("landArea", parseArea(lotDimensionsLine?.match(/Dimension lot\s*:[^=]*=\s*([^\t]+)/iu)?.[1]));
  assign("buildingArea", parseArea(floorAreaLine?.match(/Aire d['’][ÉEée]tage\s*:\s*([^\t]+)/iu)?.[1]));

  const zoningLine = lines.find((line) => /Zonage agricole\s*:/iu.test(line));
  const waterfrontLine = lines.find((line) => /Bord de l['’]eau\s*:/iu.test(line));
  assign("agriculturalZoning", parseJlrBoolean(zoningLine?.match(/Zonage agricole\s*:\s*([^\t]+)/iu)?.[1]));
  assign("waterfront", parseJlrBoolean(waterfrontLine?.match(/Bord de l['’]eau\s*:\s*([^\t]+)/iu)?.[1]));

  const assessment = extractCurrentAssessment(lines);
  assign("municipalAssessment", assessment);

  const incomeProperty: IncomePropertyData = { numberOfUnits };
  if (numberOfUnits !== undefined) assign("incomeProperty", incomeProperty);

  const propertyTransactions = extractTransactions(lines);
  assign("propertyTransactions", propertyTransactions);

  const detectedImageCount = metadata.detectedImageCount ?? 0;
  assign("photoDetection", {
    detected: detectedImageCount > 0,
    count: detectedImageCount || undefined,
    extractionSupported: true,
  }, detectedImageCount > 0 ? "medium" : "low");

  if (detectPropertyDocumentType(text) !== "jlr") warnings.push("Le document ne présente pas les marqueurs attendus d’un feuillet JLR.");
  if (!data.address) warnings.push("L’adresse n’a pas pu être détectée sans ambiguïté.");
  if (!data.propertyCategory) warnings.push("La catégorie n’a pas pu être déterminée sans ambiguïté.");

  return {
    id: metadata.id,
    sourceFile: metadata.sourceFile,
    sourceType: "pdf",
    documentType: "jlr",
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
