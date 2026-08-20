import type { CentrisParseResult } from "./types";

export type CentrisTransactionSuggestions = Pick<
  CentrisParseResult["suggestedTransactionValues"],
  "address" | "centrisNumber" | "price" | "promiseDate" | "generalNotes"
>;

function money(value: number) {
  return new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(value) + " $";
}

export function buildCentrisGeneralNotes(result: Omit<CentrisParseResult, "suggestedTransactionValues">) {
  const lines = [
    "FICHE CENTRIS IMPORTÉE",
    "",
    result.property.genreRaw ? `Genre : ${result.property.genreRaw}` : null,
    result.centrisMarketStatusRaw ? `Statut Centris : ${result.centrisMarketStatusRaw}` : null,
    result.pricing.rawText ? `Prix affiché : ${result.pricing.rawText}` : null,
    result.property.yearBuilt ? `Année : ${result.property.yearBuilt}` : null,
    result.property.numberOfUnits ? `Unités : ${result.property.numberOfUnits}` : null,
    result.financial.grossPotentialRevenueAnnual ? `Revenus bruts potentiels : ${money(result.financial.grossPotentialRevenueAnnual)} / année` : null,
    result.financial.netOperatingIncomeAnnual ? `Revenus nets d’exploitation : ${money(result.financial.netOperatingIncomeAnnual)} / année` : null,
    result.financial.municipalTaxesAnnual ? `Taxes municipales : ${money(result.financial.municipalTaxesAnnual)}` : null,
    result.financial.schoolTaxesAnnual ? `Taxes scolaires : ${money(result.financial.schoolTaxesAnnual)}` : null,
    result.financial.condoFeesMonthly ? `Frais de copropriété : ${money(result.financial.condoFeesMonthly)} / mois` : null,
    result.financial.supplementalRevenueMonthly ? `Revenu supplémentaire : ${money(result.financial.supplementalRevenueMonthly)} / mois` : null,
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
}

export function mapCentrisResultToTransactionSuggestions(
  result: Omit<CentrisParseResult, "suggestedTransactionValues">,
): CentrisTransactionSuggestions {
  const price = result.pricing.mode === "sale_price"
    ? result.pricing.amount
    : result.pricing.mode === "monthly_rent"
      ? result.pricing.monthlyAmount
      : null;
  return {
    address: result.address.fullAddress,
    centrisNumber: result.centrisNumber,
    price,
    promiseDate: result.dates.paAcceptedDate,
    generalNotes: buildCentrisGeneralNotes(result),
  };
}
