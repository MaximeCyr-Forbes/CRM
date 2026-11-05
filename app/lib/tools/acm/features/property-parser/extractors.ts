import type { PropertyArea, PropertyDimensions } from "@/app/lib/tools/acm/types";
import { cleanExtractedValue, normalizeSearchText } from "./normalization";

export function getTextLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isKnownLabel(value: string, labels: readonly string[]): boolean {
  const normalized = normalizeSearchText(value.replace(/:$/, ""));
  return labels.some((label) => {
    const known = normalizeSearchText(label);
    return normalized === known || normalized.startsWith(`${known}:`);
  });
}

export function extractLabeledValue(
  lines: readonly string[],
  labels: readonly string[],
  stopLabels: readonly string[] = [],
): string | undefined {
  const normalizedLabels = labels.map(normalizeSearchText);

  for (const exactOnly of [true, false]) {
    for (const line of lines) {
      const cells = line.split(/\t+/).map((cell) => cell.trim()).filter(Boolean);

      for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
        const cell = cells[cellIndex];
        const normalizedCell = normalizeSearchText(cell);
        const labelIndex = normalizedLabels.findIndex((label) => exactOnly
          ? normalizedCell === label
          : normalizedCell.startsWith(`${label}:`) || normalizedCell.startsWith(`${label} `));
        if (labelIndex === -1) continue;

        const labelLength = labels[labelIndex].length;
        const sameCellValue = cleanExtractedValue(cell.slice(labelLength));
        if (sameCellValue) return sameCellValue;

        const nextCellValue = cleanExtractedValue(cells[cellIndex + 1] ?? "");
        if (nextCellValue && !isKnownLabel(nextCellValue, [...labels, ...stopLabels])) {
          return nextCellValue;
        }
      }
    }
  }

  return undefined;
}

export function extractSection(
  lines: readonly string[],
  headings: readonly string[],
  stopHeadings: readonly string[],
): string | undefined {
  const normalizedHeadings = headings.map(normalizeSearchText);
  const normalizedStops = stopHeadings.map(normalizeSearchText);
  const start = lines.findIndex((line) => normalizedHeadings.includes(normalizeSearchText(line.replace(/:$/, ""))));
  if (start === -1) return undefined;

  const collected: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const normalized = normalizeSearchText(line.replace(/:$/, ""));
    if (normalizedStops.some((stop) => normalized === stop || normalized.startsWith(`${stop} `))) break;
    if (/no centris\s+\d{7,10}\s+-\s+page\s+\d+/iu.test(line)) continue;
    collected.push(line);
  }

  return cleanExtractedValue(collected.join(" "));
}

export function parseLocalizedNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.replace(/\s/g, "").match(/-?\d[\d.,]*/);
  if (!match) return undefined;

  let normalized = match[0];
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma > lastDot) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(/,/g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseInteger(value?: string): number | undefined {
  const parsed = parseLocalizedNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

export function parseCount(value?: string): number | undefined {
  if (!value) return undefined;
  const addition = value.match(/\b(\d+)\s*\+\s*(\d+)\b/);
  if (addition) return Number(addition[1]) + Number(addition[2]);
  return parseInteger(value);
}

export function parseParkingCount(value?: string): number | undefined {
  if (!value) return undefined;
  const driveway = value.match(/(?:allée|allee|stationnement(?: extérieur)?)\s*\((\d+)\)/iu);
  if (driveway) return Number(driveway[1]);
  const parentheticalCounts = Array.from(value.matchAll(/\((\d+)\)/g), (match) => Number(match[1]));
  if (parentheticalCounts.length > 0) {
    return parentheticalCounts.reduce((sum, count) => sum + count, 0);
  }
  return parseCount(value);
}

export function parseMoney(value?: string): number | undefined {
  const parsed = parseLocalizedNumber(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

export function parseDimensions(value?: string): PropertyDimensions | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*(?:p|pi|pied|ft|m)?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(p|pi|pied|ft|m)\b/i);
  if (!match) return undefined;

  const width = parseLocalizedNumber(match[1]);
  const depth = parseLocalizedNumber(match[2]);
  if (width === undefined || depth === undefined) return undefined;

  return {
    width,
    depth,
    unit: /^m$/i.test(match[3]) ? "m" : "ft",
    ...(/\birr(?:égulier)?\b/iu.test(value) ? { irregular: true } : {}),
  };
}

export function parseArea(value?: string): PropertyArea | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d[\d\s.,]*)\s*(pi(?:2|²| carres?)?|p2|pc|ft2|sq\.?\s*ft|m(?:2|²| carres?)?|sqm)\b/i);
  if (!match) return undefined;
  const parsed = parseLocalizedNumber(match[1]);
  if (parsed === undefined) return undefined;
  return { value: parsed, unit: /^m/i.test(match[2]) || /sqm/i.test(match[2]) ? "sqm" : "sqft" };
}

export function parseList(value?: string): string[] | undefined {
  if (!value) return undefined;
  const items = value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export function extractPostalCode(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.toUpperCase().match(/\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/);
  if (!match) return undefined;
  const compact = match[0].replace(/\s/g, "");
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

export function extractCentrisNumber(text: string, labeledValue?: string): string | undefined {
  const labeledMatch = labeledValue?.match(/\b\d{7,10}\b/);
  if (labeledMatch) return labeledMatch[0];
  return text.match(/(?:no|n°|numero|numéro)?\s*centris(?:®)?\s*(?:no|n°|#|:)?\s*(\d{7,10})/iu)?.[1];
}

export function extractStrictStreetAddress(lines: readonly string[]): string | undefined {
  const match = lines.find((line) =>
    /^\d{1,6}(?:\s*-\s*\d{1,6})?[, ]+[\p{L}\d'’ .-]{2,100}$/u.test(line)
      && /\b(?:rue|avenue|av\.|boulevard|boul\.|chemin|ch\.|rang|route|place|croissant|montée)\b/iu.test(line),
  );
  return match ? cleanExtractedValue(match.split(",")[0]) : undefined;
}

export function parseFrenchDate(value?: string): string | undefined {
  if (!value) return undefined;
  const isoMatch = value.match(/\b(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;

  const numericMatch = value.match(/\b([0-3]?\d)[-/]([01]?\d)[-/](20\d{2})\b/);
  if (numericMatch) return `${numericMatch[3]}-${numericMatch[2].padStart(2, "0")}-${numericMatch[1].padStart(2, "0")}`;

  const months: Record<string, string> = {
    janvier: "01", fevrier: "02", mars: "03", avril: "04", mai: "05", juin: "06",
    juillet: "07", aout: "08", septembre: "09", octobre: "10", novembre: "11", decembre: "12",
  };
  const normalized = normalizeSearchText(value);
  const wordMatch = normalized.match(/\b([0-3]?\d)\s+([a-z]+)\s+(20\d{2})\b/);
  if (!wordMatch || !months[wordMatch[2]]) return undefined;
  return `${wordMatch[3]}-${months[wordMatch[2]]}-${wordMatch[1].padStart(2, "0")}`;
}
