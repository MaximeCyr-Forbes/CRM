import type { PositionedPDFPage, PositionedPDFText, PositionedPDFTextItem } from "../pdf/extract-positioned-text";
import { compactPurchaseAgreementText, normalizePurchaseAgreementText } from "./normalize";
import type { PurchaseAgreementAddress, PurchaseAgreementParseResult } from "./types";

const emptyAddress = (): PurchaseAgreementAddress => ({
  fullAddress: "",
  civicNumber: "",
  street: "",
  city: "",
  province: "",
  postalCode: "",
});

function groupItemsByLine(items: PositionedPDFTextItem[], tolerance = 2.2) {
  const lines: Array<{ y: number; items: PositionedPDFTextItem[] }> = [];
  for (const item of [...items].sort((first, second) => second.y - first.y || first.x - second.x)) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines
    .map((line) => ({
      y: line.y,
      text: line.items.sort((first, second) => first.x - second.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim(),
    }))
    .sort((first, second) => second.y - first.y);
}

function isStrongOACIQPurchaseAgreement(extracted: PositionedPDFText) {
  const compact = compactPurchaseAgreementText(extracted.pages.map((page) => page.text).join(" "));
  return [
    "PROMESSEDACHAT",
    "IDENTIFICATIONDESPARTIES",
    "DESCRIPTIONSOMMAIREDELIMMEUBLE",
    "PRIXETACOMPTE",
  ].every((marker) => compact.includes(marker));
}

function partyLabel(page: PositionedPDFPage, role: "ACHETEUR" | "VENDEUR", slot: number) {
  return page.items.find((item) => {
    const value = normalizePurchaseAgreementText(item.text);
    return value.includes(role) && new RegExp(`\\b${slot}\\b`).test(value) && value.includes("NOM");
  });
}

function partyName(page: PositionedPDFPage, role: "ACHETEUR" | "VENDEUR", slot: number) {
  const label = partyLabel(page, role, slot);
  if (!label) return "";
  const precedingLabel = slot === 1
    ? page.items.find((item) => normalizePurchaseAgreementText(item.text).includes("IDENTIFICATION DES PARTIES"))
    : partyLabel(page, role, slot - 1);
  const lowerY = label.y + 10;
  const upperY = (precedingLabel?.y ?? page.height) - (slot === 1 ? 8 : 24);
  const middle = page.width / 2;
  const columnItems = page.items.filter((item) => {
    const inColumn = role === "ACHETEUR" ? item.x < middle : item.x >= middle && item.x < page.width - 20;
    return inColumn && item.y > lowerY && item.y < upperY;
  });
  const line = groupItemsByLine(columnItems).find((candidate) => {
    const normalized = normalizePurchaseAgreementText(candidate.text);
    return candidate.text.length <= 120
      && !/\d/.test(candidate.text)
      && !normalized.includes("ACHETEUR")
      && !normalized.includes("VENDEUR")
      && !normalized.includes("REPRESENTANT")
      && !normalized.includes("SOCIETE");
  });
  return line?.text.normalize("NFC").trim() ?? "";
}

function parseParties(extracted: PositionedPDFText) {
  const page = extracted.pages.find((candidate) => compactPurchaseAgreementText(candidate.text).includes("IDENTIFICATIONDESPARTIES"));
  if (!page) return { buyers: [], sellers: [] };
  const buyers = [1, 2, 3, 4].map((slot) => partyName(page, "ACHETEUR", slot)).filter(Boolean);
  const sellers = [1, 2, 3, 4].map((slot) => partyName(page, "VENDEUR", slot)).filter(Boolean);
  return { buyers, sellers };
}

function parseAddressLine(value: string): PurchaseAgreementAddress {
  const normalizedValue = value.normalize("NFC").replace(/\s+,/g, ",").replace(/,\s*/g, ", ").trim();
  const civicMatch = normalizedValue.match(/^\s*(\d+[A-Za-z]?(?:\s*[-–—]\s*\d+[A-Za-z]?)?)[,\s]+/);
  const postalMatch = normalizedValue.match(/\b([A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d)\b/);
  if (!civicMatch || !postalMatch) return emptyAddress();
  const civicNumber = civicMatch[1].replace(/[–—]/g, "-").replace(/\s/g, "");
  const parts = normalizedValue.split(",").map((part) => part.trim()).filter(Boolean);
  const firstPart = parts.shift() ?? "";
  let street = firstPart.slice(firstPart.indexOf(civicMatch[1]) + civicMatch[1].length).trim();
  if (!street && parts.length > 0) street = parts.shift() ?? "";
  const postalCode = postalMatch[1].toUpperCase().replace(/\s+/g, " ");
  const postalIndex = parts.findIndex((part) => /[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d/i.test(part));
  const provincePart = postalIndex >= 0
    ? parts.slice(postalIndex + 1).find((part) => /^(QC|QU[EÉ]BEC)$/i.test(part))
    : parts.find((part) => /^(QC|QU[EÉ]BEC)$/i.test(part));
  const province = provincePart ? (/^QC$/i.test(provincePart) ? "QC" : "Québec") : "";
  const city = postalIndex > 0
    ? parts[postalIndex - 1]
    : parts.find((part) => !/^(QC|QU[EÉ]BEC)$/i.test(part) && !/[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d/i.test(part)) ?? "";
  return {
    fullAddress: [
      `${civicNumber} ${street}`.trim(),
      city,
      postalCode,
      province,
    ].filter(Boolean).join(", "),
    civicNumber,
    street,
    city,
    province,
    postalCode,
  };
}

function parsePropertyAddress(extracted: PositionedPDFText) {
  const page = extracted.pages.find((candidate) => compactPurchaseAgreementText(candidate.text).includes("DESCRIPTIONSOMMAIREDELIMMEUBLE"));
  if (!page) return emptyAddress();
  const clause = page.items.find((item) => /^3[.,]1$/.test(item.text.trim()));
  if (!clause) return emptyAddress();
  const nextSection = page.items.find((item) => /^4[.,]?$/.test(item.text.trim()) && item.y < clause.y);
  const lines = groupItemsByLine(page.items.filter((item) => item.y < clause.y - 2 && item.y > (nextSection?.y ?? 0)));
  const addressLine = lines.find((line) => /^\s*\d+[A-Za-z]?(?:\s*[-–—]\s*\d+[A-Za-z]?)?/.test(line.text)
    && /\b[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d\b/i.test(line.text));
  return addressLine ? parseAddressLine(addressLine.text) : emptyAddress();
}

function parsePrice(extracted: PositionedPDFText) {
  const page = extracted.pages.find((candidate) => compactPurchaseAgreementText(candidate.text).includes("PRIXETACOMPTE"));
  if (!page) return null;
  const clause = page.items.find((item) => /^4[.,]1$/.test(item.text.trim()));
  if (!clause) return null;
  const nextClause = page.items.find((item) => /^4[.,]2$/.test(item.text.trim()) && item.y < clause.y);
  const lines = groupItemsByLine(page.items.filter((item) => item.y < clause.y && item.y > (nextClause?.y ?? 0)));
  for (const line of lines) {
    const match = line.text.match(/\b(\d[\d\s\u00a0]*(?:[,\.]\d{2})?)\s*\$/);
    if (!match) continue;
    const parsed = Number(match[1].replace(/[\s\u00a0]/g, "").replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }
  return null;
}

export function parsePurchaseAgreement(extracted: PositionedPDFText): PurchaseAgreementParseResult {
  const recognized = isStrongOACIQPurchaseAgreement(extracted);
  const { buyers, sellers } = recognized ? parseParties(extracted) : { buyers: [], sellers: [] };
  const propertyAddress = recognized ? parsePropertyAddress(extracted) : emptyAddress();
  const amount = recognized ? parsePrice(extracted) : null;
  const warnings: string[] = [];
  if (!recognized) warnings.push("PROMESSE D’ACHAT NON RECONNUE");
  if (recognized && buyers.length === 0) warnings.push("Acheteur manquant dans la section 1.");
  if (recognized && sellers.length === 0) warnings.push("Vendeur manquant dans la section 1.");
  if (recognized && !propertyAddress.fullAddress) warnings.push("Adresse de l’immeuble manquante à la clause 3.1.");
  if (recognized && amount === null) warnings.push("Prix offert manquant à la clause 4.1.");
  return { recognized, buyers, sellers, propertyAddress, amount, warnings };
}
