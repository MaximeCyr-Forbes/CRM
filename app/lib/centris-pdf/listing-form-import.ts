import {
  LISTING_PROPERTY_TYPE_LABELS,
  LISTING_PURPOSE_LABELS,
  LISTING_STATUS_LABELS,
  type ListingDraft,
  type ListingPurpose,
  type ListingStatus,
} from "../../data/listing-types";
import { statusesForListingPurpose, validStatusForListingPurpose } from "../listings/editor";
import { mergeCentrisGeneralNotes } from "./form-import";
import type { CentrisConfidence, CentrisParseResult } from "./types";

export const CENTRIS_LISTING_IMPORT_FIELDS = [
  "address",
  "centrisNumber",
  "propertyType",
  "purpose",
  "price",
  "status",
  "generalNotes",
] as const;

export type CentrisListingImportField = (typeof CENTRIS_LISTING_IMPORT_FIELDS)[number];
export type CentrisListingImportSelection = Record<CentrisListingImportField, boolean>;

export type CentrisListingImportPreviewField = {
  field: CentrisListingImportField;
  currentValue: string | number | null;
  centrisValue: string | number | null;
  confidence: CentrisConfidence;
  available: boolean;
  hasConflict: boolean;
};

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(value)} $`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function roomsLabel(result: CentrisParseResult) {
  const bedrooms = result.property.bedroomsAboveGround === null && result.property.bedroomsBasement === null
    ? null
    : (result.property.bedroomsAboveGround ?? 0) + (result.property.bedroomsBasement ?? 0);
  return [
    result.property.numberOfRooms === null ? null : `Pièces : ${result.property.numberOfRooms}`,
    bedrooms === null ? null : `Chambres : ${bedrooms}`,
    result.property.bathrooms === null ? null : `Salles de bains : ${result.property.bathrooms}`,
    result.property.powderRooms === null ? null : `Salles d’eau : ${result.property.powderRooms}`,
  ];
}

export function buildCentrisListingGeneralNotes(result: CentrisParseResult) {
  const lines: Array<string | null> = [
    "FICHE CENTRIS IMPORTÉE",
    "",
    result.property.genreRaw ? `Genre : ${result.property.genreRaw}` : null,
    result.centrisMarketStatusRaw ? `Statut Centris : ${result.centrisMarketStatusRaw}` : null,
    result.pricing.rawText ? `Prix affiché : ${result.pricing.rawText}` : null,
    result.property.intergenerational === true ? "Intergénération : Oui" : null,
    result.property.yearBuilt === null ? null : `Année : ${result.property.yearBuilt}`,
    result.property.numberOfUnits === null ? null : `Nombre d’unités : ${result.property.numberOfUnits}`,
    ...roomsLabel(result),
    result.property.livingAreaSqFt === null ? null : `Superficie habitable : ${result.property.livingAreaSqFt} pi²`,
    result.property.buildingAreaSqFt === null ? null : `Superficie bâtiment : ${result.property.buildingAreaSqFt} pi²`,
    result.property.availableAreaSqFt === null ? null : `Superficie disponible : ${result.property.availableAreaSqFt} pi²`,
    result.property.landAreaSqFt === null ? null : `Superficie terrain : ${result.property.landAreaSqFt} pi²`,
    result.financial.municipalTaxesAnnual === null ? null : `Taxes municipales : ${formatMoney(result.financial.municipalTaxesAnnual)} / année`,
    result.financial.schoolTaxesAnnual === null ? null : `Taxes scolaires : ${formatMoney(result.financial.schoolTaxesAnnual)} / année`,
    result.financial.condoFeesMonthly === null ? null : `Frais de copropriété : ${formatMoney(result.financial.condoFeesMonthly)} / mois`,
    result.financial.grossPotentialRevenueAnnual === null ? null : `Revenus bruts potentiels : ${formatMoney(result.financial.grossPotentialRevenueAnnual)} / année`,
    result.financial.netOperatingIncomeAnnual === null ? null : `Revenus nets d’exploitation : ${formatMoney(result.financial.netOperatingIncomeAnnual)} / année`,
    result.financial.supplementalRevenueMonthly === null ? null : `Revenu supplémentaire : ${formatMoney(result.financial.supplementalRevenueMonthly)} / mois`,
    result.pricing.taxesApplicable === true ? "TPS/TVQ applicables" : null,
    result.dates.occupancyDate ? `Occupation : ${formatDate(result.dates.occupancyDate)}` : null,
    result.dates.conditionsLiftedDate ? `Levée des conditions : ${formatDate(result.dates.conditionsLiftedDate)}` : null,
  ];

  if (result.rentalUnits.length > 0) {
    lines.push("", "UNITÉS LOCATIVES");
    result.rentalUnits.forEach((unit, index) => {
      const details = [
        unit.rooms === null ? null : `${unit.rooms} pièces`,
        unit.bedrooms === null ? null : `${unit.bedrooms} chambres`,
        unit.bathrooms === null ? null : `${unit.bathrooms} salles de bains`,
        unit.monthlyRent === null ? null : `${formatMoney(unit.monthlyRent)} / mois`,
        unit.leaseEndDate ? `bail jusqu’au ${formatDate(unit.leaseEndDate)}` : null,
      ].filter((item): item is string => Boolean(item));
      lines.push(`${unit.unitNumber || `Logement ${index + 1}`} : ${details.join(" · ")}`);
    });
  }

  const sectionLabels: Record<keyof CentrisParseResult["sections"], string> = {
    inclusions: "Inclusions",
    exclusions: "Exclusions",
    remarks: "Remarques",
    addendum: "Addenda",
  };
  (Object.keys(result.sections) as Array<keyof CentrisParseResult["sections"]>).forEach((key) => {
    const content = result.sections[key].trim();
    if (content) lines.push("", `${sectionLabels[key]} :`, content);
  });

  return lines.filter((line): line is string => line !== null).join("\n").trim();
}

function detectedPurpose(result: CentrisParseResult): ListingPurpose | null {
  return result.pricing.detectedPurpose === "sale" || result.pricing.detectedPurpose === "rental"
    ? result.pricing.detectedPurpose
    : null;
}

function detectedStatus(result: CentrisParseResult): ListingStatus | null {
  if (result.centrisMarketStatus === "active") return "active";
  if (result.centrisMarketStatus === "sold") return "sold";
  if (result.centrisMarketStatus === "rented") return "rented";
  return null;
}

function detectedPrice(result: CentrisParseResult) {
  if (result.pricing.mode === "sale_price") return result.pricing.amount;
  if (result.pricing.mode === "monthly_rent") return result.pricing.monthlyAmount;
  if (result.pricing.mode === "annual_per_square_foot") return result.pricing.annualPerSquareFootAmount;
  return null;
}

function currentAddress(values: ListingDraft) {
  return [
    [values.civicNumber, values.address].filter(Boolean).join(" "),
    values.apartment ? `app. ${values.apartment}` : "",
    values.city,
    [values.province, values.postalCode].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
}

function centrisAddress(result: CentrisParseResult) {
  return result.address.fullAddress || [
    [result.address.civicNumber, result.address.street].filter(Boolean).join(" "),
    result.address.unit ? `app. ${result.address.unit}` : "",
    result.address.city,
    [result.address.province, result.address.postalCode].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
}

function normalized(value: string | number | null) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr-CA");
}

function fieldConfidence(result: CentrisParseResult, field: CentrisListingImportField): CentrisConfidence {
  if (field === "generalNotes") return result.isRecognizedCentrisDocument ? "high" : "low";
  if (field === "purpose" || field === "price") return result.confidence.price ?? "low";
  if (field === "status") return result.confidence.centrisMarketStatus ?? "low";
  return result.confidence[field] ?? "low";
}

function fieldValues(current: ListingDraft, result: CentrisParseResult, field: CentrisListingImportField) {
  if (field === "address") return { currentValue: currentAddress(current), centrisValue: centrisAddress(result) };
  if (field === "centrisNumber") return { currentValue: current.centrisNumber, centrisValue: result.centrisNumber };
  if (field === "propertyType") return {
    currentValue: LISTING_PROPERTY_TYPE_LABELS[current.propertyType],
    centrisValue: LISTING_PROPERTY_TYPE_LABELS[result.property.normalizedType],
  };
  if (field === "purpose") return {
    currentValue: LISTING_PURPOSE_LABELS[current.purpose],
    centrisValue: detectedPurpose(result) ? LISTING_PURPOSE_LABELS[detectedPurpose(result)!] : null,
  };
  if (field === "price") {
    const purpose = detectedPurpose(result);
    return {
      currentValue: purpose === "rental" ? current.monthlyRent : current.askingPrice,
      centrisValue: detectedPrice(result),
    };
  }
  if (field === "status") return {
    currentValue: LISTING_STATUS_LABELS[current.status],
    centrisValue: detectedStatus(result) ? LISTING_STATUS_LABELS[detectedStatus(result)!] : null,
  };
  return {
    currentValue: current.generalNotes,
    centrisValue: buildCentrisListingGeneralNotes(result),
  };
}

function hasMeaningfulCurrentValue(current: ListingDraft, field: CentrisListingImportField) {
  if (field === "address") {
    return Boolean(current.civicNumber.trim() || current.address.trim() || current.apartment.trim()
      || current.city.trim() || current.postalCode.trim());
  }
  if (field === "propertyType") return current.propertyType !== "residential";
  if (field === "purpose") return current.purpose !== "sale";
  if (field === "status") return current.status !== "preparation";
  if (field === "price") return current.askingPrice !== null || current.monthlyRent !== null;
  return Boolean(String(field === "centrisNumber" ? current.centrisNumber : current.generalNotes).trim());
}

function fieldAvailable(result: CentrisParseResult, field: CentrisListingImportField, centrisValue: string | number | null) {
  if (field === "address") return Boolean(centrisAddress(result));
  if (field === "propertyType") return Boolean(result.property.genreRaw) || result.property.normalizedType !== "other";
  if (field === "purpose") return detectedPurpose(result) !== null;
  if (field === "status") return detectedStatus(result) !== null;
  if (field === "price" && result.pricing.mode === "annual_per_square_foot") return false;
  return centrisValue !== null && String(centrisValue).trim() !== "";
}

export function buildCentrisListingImportPreview(
  current: ListingDraft,
  result: CentrisParseResult,
): CentrisListingImportPreviewField[] {
  return CENTRIS_LISTING_IMPORT_FIELDS.map((field) => {
    const { currentValue, centrisValue } = fieldValues(current, result, field);
    const available = fieldAvailable(result, field, centrisValue);
    const hasCurrentValue = hasMeaningfulCurrentValue(current, field);
    return {
      field,
      currentValue,
      centrisValue,
      confidence: fieldConfidence(result, field),
      available,
      hasConflict: available && hasCurrentValue && normalized(currentValue) !== normalized(centrisValue),
    };
  });
}

export function defaultCentrisListingImportSelection(
  current: ListingDraft,
  result: CentrisParseResult,
): CentrisListingImportSelection {
  return Object.fromEntries(buildCentrisListingImportPreview(current, result).map((item) => {
    const safeConfidence = item.confidence === "high" || item.confidence === "medium";
    const hasCurrentValue = hasMeaningfulCurrentValue(current, item.field);
    const same = normalized(item.currentValue) === normalized(item.centrisValue);
    const appendableNotes = item.field === "generalNotes" && item.available && safeConfidence;
    return [item.field, appendableNotes || (item.available && safeConfidence && (!hasCurrentValue || same))];
  })) as CentrisListingImportSelection;
}

function clearlyCanadian(result: CentrisParseResult) {
  return /^(?:QC|Québec)$/i.test(result.address.province.trim())
    || /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(result.address.postalCode.trim());
}

export function applyCentrisListingImport(
  current: ListingDraft,
  result: CentrisParseResult,
  selection: CentrisListingImportSelection,
): ListingDraft {
  const next: ListingDraft = { ...current, ownerContactIds: [...current.ownerContactIds] };
  const purpose = detectedPurpose(result);

  if (selection.address && centrisAddress(result)) {
    next.civicNumber = result.address.civicNumber || current.civicNumber;
    next.address = result.address.street || result.address.fullAddress || current.address;
    next.apartment = result.address.unit || current.apartment;
    next.city = result.address.city || current.city;
    next.province = result.address.province || current.province;
    next.postalCode = result.address.postalCode || current.postalCode;
    if (!current.country.trim() && clearlyCanadian(result)) next.country = "Canada";
  }
  if (selection.centrisNumber && result.centrisNumber) next.centrisNumber = result.centrisNumber;
  if (selection.propertyType && fieldAvailable(result, "propertyType", result.property.genreRaw)) {
    next.propertyType = result.property.normalizedType;
  }
  if (selection.purpose && purpose) {
    next.purpose = purpose;
    next.status = validStatusForListingPurpose(purpose, next.status);
    if (purpose === "sale") next.monthlyRent = null;
    else next.askingPrice = null;
  }
  if (selection.price && result.pricing.mode === "sale_price" && result.pricing.amount !== null && next.purpose === "sale") {
    next.askingPrice = result.pricing.amount;
  }
  if (selection.price && result.pricing.mode === "monthly_rent" && result.pricing.monthlyAmount !== null && next.purpose === "rental") {
    next.monthlyRent = result.pricing.monthlyAmount;
  }
  const status = detectedStatus(result);
  if (selection.status && status && statusesForListingPurpose(next.purpose).includes(status)) next.status = status;
  if (selection.generalNotes) {
    next.generalNotes = mergeCentrisGeneralNotes(
      current.generalNotes,
      buildCentrisListingGeneralNotes(result),
      result.centrisNumber,
    );
  }
  return next;
}
