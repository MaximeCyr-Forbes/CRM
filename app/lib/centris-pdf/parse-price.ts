import type { CentrisParseResult } from "./types";

function numericValue(raw: string) {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function parseMoney(raw: string | undefined) {
  return raw ? numericValue(raw) : null;
}

export function parseCentrisPricing(firstPage: string): CentrisParseResult["pricing"] {
  const annual = /(\d+(?:[,.]\d+)?)\s*\$\s*\/\s*(?:année|an)\s*\/\s*(?:pc|pi\s*[²2])/i.exec(firstPage);
  const monthly = /(\d[\d\s]*(?:[,.]\d+)?)\s*\$\s*\/\s*mois/i.exec(firstPage);
  const sale = /(\d[\d\s]*(?:[,.]\d+)?)\s*\$(?!\s*\/)/i.exec(firstPage);
  const candidates = [
    annual && { kind: "annual" as const, match: annual },
    monthly && { kind: "monthly" as const, match: monthly },
    sale && { kind: "sale" as const, match: sale },
  ].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  const selected = candidates.sort((left, right) => left.match.index - right.match.index)[0];
  const match = selected?.match ?? null;
  const suffix = match
    ? /^\s*(?:(?:\+\s*)?TPS\s*\/\s*TVQ)?(?:\s*[X×]\s*\d{1,3}\s*mois)?/iu.exec(firstPage.slice(match.index + match[0].length))?.[0] ?? ""
    : "";
  const rawText = match ? `${match[0]}${suffix}`.replace(/\s+/g, " ").trim() : "";
  const taxesApplicable = match ? /TPS\s*\/\s*TVQ/i.test(rawText) : null;
  const term = /[X×]\s*(\d{1,3})\s*mois/i.exec(rawText);
  if (selected?.kind === "annual" && annual) {
    return {
      rawText,
      detectedPurpose: "rental",
      mode: "annual_per_square_foot",
      amount: null,
      monthlyAmount: null,
      annualPerSquareFootAmount: numericValue(annual[1]),
      leaseTermMonths: term ? Number(term[1]) : null,
      taxesApplicable,
    };
  }
  if (selected?.kind === "monthly" && monthly) {
    const amount = numericValue(monthly[1]);
    return {
      rawText,
      detectedPurpose: "rental",
      mode: "monthly_rent",
      amount,
      monthlyAmount: amount,
      annualPerSquareFootAmount: null,
      leaseTermMonths: term ? Number(term[1]) : null,
      taxesApplicable,
    };
  }
  if (selected?.kind === "sale" && sale) {
    const amount = numericValue(sale[1]);
    return {
      rawText,
      detectedPurpose: "sale",
      mode: "sale_price",
      amount,
      monthlyAmount: null,
      annualPerSquareFootAmount: null,
      leaseTermMonths: null,
      taxesApplicable,
    };
  }
  return {
    rawText: "",
    detectedPurpose: "unknown",
    mode: "unknown",
    amount: null,
    monthlyAmount: null,
    annualPerSquareFootAmount: null,
    leaseTermMonths: null,
    taxesApplicable: null,
  };
}
