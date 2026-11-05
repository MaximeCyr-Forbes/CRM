import type {
  CentrisExtraction,
  ExtractedField,
  ExtractedUnit,
  ExtractionConfidence,
  PdfTextPage,
} from "./centris-types";
import { parseLocalizedMoney } from "@/app/lib/tools/plex/lib/parsers/localized-money";

function missing<T>(key: string, label: string): ExtractedField<T> {
  return { key, label, value: null, confidence: "none", page: null, status: "missing" };
}

function found<T>(key: string, label: string, value: T, page: number | null, sourceText: string, confidence: ExtractionConfidence = "high"): ExtractedField<T> {
  return { key, label, value, confidence, page, status: confidence === "high" ? "confirmed" : "to_review", sourceText };
}

function moneyValue(raw: string): number | null {
  return parseLocalizedMoney(raw);
}

function firstMatch<T>(pages: PdfTextPage[], key: string, label: string, patterns: RegExp[], convert: (raw: string) => T | null, confidence: ExtractionConfidence = "high"): ExtractedField<T> {
  for (const page of pages) {
    for (const pattern of patterns) {
      const match = page.text.match(pattern);
      if (!match?.[1]) continue;
      const value = convert(match[1].trim());
      if (value !== null) return found(key, label, value, page.page, match[0].trim(), confidence);
    }
  }
  return missing(key, label);
}

const EXPENSE_LABELS = [
  ["insurance", "Assurance", /(?:Assurances?|Primes? d['’]assurance)(?:\s*\([^)]*\))?\s*:?\s*([\d\s.,]+)\s*\$/i],
  ["lawn", "Gazon", /(?:Gazon|Pelouse|Entretien du terrain)\s*:?\s*([\d\s.,]+)\s*\$/i],
  ["snowRemoval", "Déneigement", /D[ée]neigement\s*:?\s*([\d\s.,]+)\s*\$/i],
  ["maintenance", "Entretien", /(?:Entretien général|Entretien)\s*:?\s*([\d\s.,]+)\s*\$/i],
  ["repairs", "Réparations", /Réparations?\s*:?\s*([\d\s.,]+)\s*\$/i],
  ["electricity", "Électricité", /[ÉE]lectricit[ée]\s*:?\s*([\d\s.,]+)\s*\$/i],
  ["heating", "Chauffage", /Chauffage\s*:?\s*([\d\s.,]+)\s*\$/i],
  ["management", "Gestion (% des revenus bruts)", /(?:Frais de gestion|Gestion(?:\/Administration)?)\s*:?\s*([\d\s.,]+)\s*%/i],
  ["other", "Autres dépenses", /(?:Autres dépenses|Ordures)\s*:?\s*([\d\s.,]+)\s*\$/i],
] as const;

function extractUnits(pages: PdfTextPage[], declaredUnitCount: number | null): ExtractedUnit[] {
  const unitsByNumber = new Map<string, ExtractedUnit>();
  const unitOrder: string[] = [];
  const registerUnit = (number: string, unit: ExtractedUnit) => {
    const key = number.trim().toLocaleUpperCase("fr-CA");
    const existing = unitsByNumber.get(key);
    if (!existing) {
      unitsByNumber.set(key, unit);
      unitOrder.push(key);
      return;
    }
    unitsByNumber.set(key, {
      description: existing.description.value !== null ? existing.description : unit.description,
      currentMonthlyRent: existing.currentMonthlyRent.value !== null ? existing.currentMonthlyRent : unit.currentMonthlyRent,
      potentialMonthlyRent: existing.potentialMonthlyRent.value !== null ? existing.potentialMonthlyRent : unit.potentialMonthlyRent,
      occupancyStatus: existing.occupancyStatus.value !== null ? existing.occupancyStatus : unit.occupancyStatus,
    });
  };

  const pattern = /(?:Logement|Unité|Appartement)\s*(?:#|no\.?\s*)?(\d+)\s*[:\-–]\s*([^\n|]+?)(?:\s*\|\s*Loyer actuel\s*:?\s*([\d\s.,]+)\s*\$)?(?:\s*\|\s*Loyer potentiel\s*:?\s*([\d\s.,]+)\s*\$)?\s*(?:\n|$)/gi;
  for (const page of pages) {
    for (const match of page.text.matchAll(pattern)) {
      const number = match[1];
      const description = match[2].trim();
      const current = match[3] ? moneyValue(match[3]) : null;
      const potential = match[4] ? moneyValue(match[4]) : null;
      registerUnit(number, {
        description: found(`unit-${number}-description`, `Description du logement ${number}`, description, page.page, match[0].trim()),
        currentMonthlyRent: current === null ? missing(`unit-${number}-current-rent`, `Loyer actuel du logement ${number}`) : found(`unit-${number}-current-rent`, `Loyer actuel du logement ${number}`, current, page.page, match[0].trim()),
        potentialMonthlyRent: potential === null ? missing(`unit-${number}-potential-rent`, `Loyer potentiel du logement ${number}`) : found(`unit-${number}-potential-rent`, `Loyer potentiel du logement ${number}`, potential, page.page, match[0].trim(), "medium"),
        occupancyStatus: missing(`unit-${number}-occupancy`, `Statut du logement ${number}`),
      });
    }
  }

  const combined = pages.map((page) => `\n[[PAGE:${page.page}]]\n${page.text}`).join("\n");
  const detailedPattern = /Num[ée]ro\s+log\.?\s*(?:Fin\s+de\s+bail\s*)?([A-Z0-9-]+)([\s\S]*?)(?=Num[ée]ro\s+log\.?|Revenus?\s+bruts?\s+potentiels?|\[\[PAGE:\d+\]\]\s*Sommaire financier|$)/gi;
  const pageAt = (position: number) => {
    const before = combined.slice(0, position);
    const markers = [...before.matchAll(/\[\[PAGE:(\d+)\]\]/g)];
    return markers.length > 0 ? Number(markers.at(-1)![1]) : null;
  };
  for (const match of combined.matchAll(detailedPattern)) {
    const number = match[1];
    const block = match[2];
    const vacancyMatch = block.match(/\bVacant\b/i);
    const rentMatch = block.match(/Loyer\s+mensuel\s*:?\s*([\d\s.,]+)\s*\$/i) ?? block.match(/((?:\d{1,3}(?:(?:[ \u00a0\u202f]|[.,])\d{3})+|\d+)(?:[.,]\d{1,2})?)\s*\$\s*Loyer\s+mensuel/i);
    const parsedRent = rentMatch ? moneyValue(rentMatch[1]) : null;
    const potentialRentMatch =
      block.match(/Valeur\s+locative\s*:?\s*([\d\s.,]+)\s*\$/i) ??
      block.match(/((?:\d{1,3}(?:(?:[ \u00a0\u202f]|[.,])\d{3})+|\d+)(?:[.,]\d{1,2})?)\s*\$\s*Valeur\s+locative/i);
    const potentialRent = potentialRentMatch ? moneyValue(potentialRentMatch[1]) : null;
    const rent = vacancyMatch && parsedRent !== null && parsedRent === potentialRent
      ? null
      : parsedRent;
    const roomMatch =
      block.match(/Nbre\s+pi[èe]ces\s*:?\s*(\d+(?:(?:[,.]5)|\s*(?:½|1\s*\/\s*2|et\s+demi))?)/i) ??
      block.match(/(\d+(?:(?:[,.]5)|\s*(?:½|1\s*\/\s*2|et\s+demi))?)\s*Nbre\s+pi[èe]ces/i);
    const description = roomMatch ? `Logement ${number} · ${roomMatch[1]} pièces` : `Logement ${number}`;
    const headerPage = pageAt(match.index ?? 0);
    const fieldPage = (fieldMatch: RegExpMatchArray | null) => {
      if (!fieldMatch) return null;
      const relativePosition = match[0].indexOf(fieldMatch[0]);
      return relativePosition < 0 ? headerPage : pageAt((match.index ?? 0) + relativePosition);
    };
    const occupiedMatch = block.match(/\bOccup[ée]\b/i);
    const occupancyStatus = vacancyMatch
      ? found<"vacant">(`unit-${number}-occupancy`, `Statut du logement ${number}`, "vacant", fieldPage(vacancyMatch), vacancyMatch[0])
      : occupiedMatch
        ? found<"occupied">(`unit-${number}-occupancy`, `Statut du logement ${number}`, "occupied", fieldPage(occupiedMatch), occupiedMatch[0])
        : missing<"occupied" | "vacant">(`unit-${number}-occupancy`, `Statut du logement ${number}`);

    registerUnit(number, {
      description: found(`unit-${number}-description`, `Description du logement ${number}`, description, headerPage, match[0].trim()),
      currentMonthlyRent: rent === null || !rentMatch
        ? missing(`unit-${number}-current-rent`, `Loyer actuel du logement ${number}`)
        : found(`unit-${number}-current-rent`, `Loyer actuel du logement ${number}`, rent, fieldPage(rentMatch), rentMatch[0].trim()),
      potentialMonthlyRent: potentialRent === null || !potentialRentMatch
        ? missing(`unit-${number}-potential-rent`, `Loyer potentiel du logement ${number}`)
        : found(`unit-${number}-potential-rent`, `Loyer potentiel du logement ${number}`, potentialRent, fieldPage(potentialRentMatch), potentialRentMatch[0].trim(), "medium"),
      occupancyStatus,
    });
  }
  const extractedUnits = unitOrder.map((key) => unitsByNumber.get(key)!);
  const undetailedCount = declaredUnitCount === null || extractedUnits.length === 0
    ? 0
    : Math.max(0, declaredUnitCount - extractedUnits.length);

  for (let index = 0; index < undetailedCount; index += 1) {
    const position = extractedUnits.length + 1;
    extractedUnits.push({
      description: missing(`unit-undetailed-${position}-description`, `Description du logement non détaillé ${position}`),
      currentMonthlyRent: missing(`unit-undetailed-${position}-current-rent`, `Loyer actuel du logement non détaillé ${position}`),
      potentialMonthlyRent: missing(`unit-undetailed-${position}-potential-rent`, `Loyer potentiel du logement non détaillé ${position}`),
      occupancyStatus: missing(`unit-undetailed-${position}-occupancy`, `Statut du logement non détaillé ${position}`),
    });
  }

  return extractedUnits;
}

function extractCentrisHeader(pages: PdfTextPage[]) {
  for (const page of pages) {
    const lines = page.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const photoMarker = lines.findIndex((line) => /Voir toutes les photos/i.test(line));
    for (let index = Math.max(0, photoMarker + 1); index < lines.length; index += 1) {
      const priceMatch = lines[index].match(/^([\d\s.,]+)\s*\$$/);
      if (!priceMatch) continue;
      const postalIndex = lines.slice(index + 1, index + 6).findIndex((line) => /^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/i.test(line));
      if (postalIndex < 2) continue;
      const absolutePostalIndex = index + 1 + postalIndex;
      const street = lines[absolutePostalIndex - 2];
      const city = lines[absolutePostalIndex - 1];
      const postalCode = lines[absolutePostalIndex];
      if (!/^\d/.test(street)) continue;
      const price = moneyValue(priceMatch[1]);
      if (price === null) continue;
      return {
        address: found("address", "Adresse", `${street}, ${city} ${postalCode}`, page.page, `${street}\n${city}\n${postalCode}`),
        askingPrice: found("asking-price", "Prix demandé", price, page.page, lines[index]),
      };
    }

    const centrisStreet = page.text.match(/No\s+Centris[^\n]*\n(\d[^\n]+)/i)?.[1]?.trim();
    if (centrisStreet) {
      const start = page.text.indexOf(centrisStreet);
      const end = page.text.search(/Genre\s+de\s+propri[ée]t[ée]/i);
      const headerSection = page.text.slice(start, end > start ? end : undefined);
      const priceMatch = headerSection.match(/(?<!\d)(?<!\d[ \u00a0\u202f.,])((?:\d{1,3}(?:(?:[ \u00a0\u202f]|[.,])\d{3})+|\d+)(?:[.,]\d{1,2})?)\s*\$/);
      const postalMatch = headerSection.match(/\b([A-Z]\d[A-Z]\s*\d[A-Z]\d)\b/i);
      if (priceMatch && postalMatch) {
        const price = moneyValue(priceMatch[1]);
        if (price === null) continue;
        const afterPostal = headerSection.slice((postalMatch.index ?? 0) + postalMatch[0].length);
        const city = afterPostal.match(/\s*\n\s*([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ-]+)/)?.[1];
        const address = city ? `${centrisStreet}, ${city} ${postalMatch[1]}` : `${centrisStreet}, ${postalMatch[1]}`;
        return {
          address: found("address", "Adresse", address, page.page, `${centrisStreet}\n${postalMatch[1]}${city ? `\n${city}` : ""}`, city ? "medium" : "high"),
          askingPrice: found("asking-price", "Prix demandé", price, page.page, priceMatch[0]),
        };
      }
    }
  }
  return { address: missing<string>("address", "Adresse"), askingPrice: missing<number>("asking-price", "Prix demandé") };
}

export function parseCentrisPages(pages: PdfTextPage[], fileName = "fiche.pdf"): CentrisExtraction {
  const header = extractCentrisHeader(pages);
  const labeledAddress = firstMatch(pages, "address", "Adresse", [/(?:Adresse de la propri[ée]t[ée]|Adresse)\s*:?\s*([^\n]+)/i], String);
  const address = labeledAddress.value === null ? header.address : labeledAddress;
  const propertyType = firstMatch(pages, "property-type", "Type d’immeuble", [/(?:Type d['’]immeuble|Genre de propri[ée]t[ée]|Type de propri[ée]t[ée])\s*:?[ \t]*?([^\n]+?)(?=[ \t]+Ann[ée]e de construction|\n|$)/i], String);
  const unitCount = firstMatch(pages, "unit-count", "Nombre de logements", [/(?:Nombre|Nb\.?|Nbre)\s+de logements\s*:?\s*(\d+)/i, /Logements\s*:?\s*(\d+)/i, /Revenus mensuels\s*\([^)]*\)\s*-\s*(\d+)\s*unit[ée]\(s\)/i], (raw) => Number.parseInt(raw, 10));
  const labeledPrice = firstMatch(pages, "asking-price", "Prix demandé", [/Prix demand[ée]\s*:?\s*([\d\s.,]+)\s*\$/i, /Prix de vente\s*:?\s*([\d\s.,]+)\s*\$/i], moneyValue);
  const askingPrice = labeledPrice.value === null ? header.askingPrice : labeledPrice;
  let currentAnnualRevenue = firstMatch(pages, "current-annual-revenue", "Revenus actuels annuels", [/(?:Revenus? bruts? actuels?|Revenus? actuels?)\s*:?\s*([\d\s.,]+)\s*\$/i], moneyValue);
  const potentialAnnualRevenue = firstMatch(pages, "potential-annual-revenue", "Revenus potentiels annuels", [/(?:Revenus? bruts? potentiels?|Revenus? potentiels?)(?:\s+annuels?)?(?:\s*\([^)]*\))?\s*:?\s*([\d\s.,]+)\s*\$/i], moneyValue, "medium");
  const reportedEffectiveGrossAnnualRevenue = firstMatch(
    pages,
    "reported-effective-gross-annual-revenue",
    "Revenus bruts effectifs déclarés dans la fiche",
    [/Revenus?\s+bruts?\s+effectifs?(?:\s+annuels?)?(?:\s*\([^)]*\))?\s*:?\s*([\d\s.,]+)\s*\$/i],
    moneyValue,
  );
  const reportedNetOperatingIncome = firstMatch(
    pages,
    "reported-net-operating-income",
    "Revenu net d’exploitation déclaré dans la fiche (informatif)",
    [/Revenus?\s+nets?\s+d['’]exploitation(?:\s+annuels?)?\s*:?\s*([\d\s.,]+)\s*\$/i],
    moneyValue,
  );
  const municipalTaxes = firstMatch(pages, "municipal-taxes", "Taxes municipales", [/Taxes?\s+municipales?(?:\s*\([^)]*\))?\s*:?\s*([\d\s.,]+)\s*\$/i], moneyValue);
  const schoolTaxes = firstMatch(pages, "school-taxes", "Taxes scolaires", [/Taxes?\s+scolaires?(?:\s*\([^)]*\))?\s*:?\s*([\d\s.,]+)\s*\$/i], moneyValue);
  const expenses = EXPENSE_LABELS.map(([key, label, pattern]) => firstMatch(pages, key, label, [pattern], moneyValue));
  const units = extractUnits(pages, unitCount.value);
  const unitCoverageComplete = unitCount.value === null || unitCount.value === units.length;
  const currentRentCoverageComplete = units.every(
    (unit) => unit.currentMonthlyRent.value !== null || unit.occupancyStatus.value === "vacant",
  );
  if (currentAnnualRevenue.value === null && units.length > 0 && unitCoverageComplete && currentRentCoverageComplete) {
    const annualTotal = units.reduce((total, unit) => total + (unit.currentMonthlyRent.value ?? 0), 0) * 12;
    const vacantUnitsWithoutRent = units.filter(
      (unit) => unit.currentMonthlyRent.value === null && unit.occupancyStatus.value === "vacant",
    ).length;
    const sourceText = vacantUnitsWithoutRent > 0
      ? `Somme exacte des loyers mensuels explicitement extraits; ${vacantUnitsWithoutRent} logement(s) sans loyer sont explicitement vacants`
      : `Somme exacte des ${units.length} loyers mensuels explicitement extraits`;
    currentAnnualRevenue = found("current-annual-revenue", "Revenus actuels annuels", annualTotal, null, sourceText, "high");
  }
  return { fileName, pageCount: pages.length, address, propertyType, unitCount, askingPrice, currentAnnualRevenue, potentialAnnualRevenue, reportedEffectiveGrossAnnualRevenue, reportedNetOperatingIncome, municipalTaxes, schoolTaxes, expenses, units };
}

export function flattenCentrisExtraction(extraction: CentrisExtraction): ExtractedField<unknown>[] {
  return [extraction.address, extraction.propertyType, extraction.unitCount, extraction.askingPrice, extraction.currentAnnualRevenue, extraction.potentialAnnualRevenue, extraction.reportedEffectiveGrossAnnualRevenue, extraction.reportedNetOperatingIncome, extraction.municipalTaxes, extraction.schoolTaxes, ...extraction.expenses, ...extraction.units.flatMap((unit) => [unit.description, unit.currentMonthlyRent, unit.potentialMonthlyRent])];
}
