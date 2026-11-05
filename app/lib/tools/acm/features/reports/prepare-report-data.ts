import type { CmaReportData, PropertyArea, PropertyCategory, PropertyData, PropertyDimensions } from "../../types";
import { calculateDerivedMetrics, getComparisonRows } from "../comparables";
import { PROPERTY_CATEGORY_LABELS, PROPERTY_STATUS_LABELS } from "../analysis/presentation";
import { formatCmaCurrency, formatSignedCurrency, REFERENCE_PRICE_SOURCE_LABELS } from "../analysis/value-presentation";
import { createReportFileName } from "./file-name";
import { formatYear } from "./value-formatting";
import type { ReportDocumentData, ReportField, ReportPropertySection, ReportComparableSection, ReportComparisonRow, ReportTemplateId } from "./types";
import { getReportPreparer } from "@/app/lib/tools/acm/features/analysis/preparers";

const REPORT_ROW_IDS: Record<PropertyCategory, string[]> = {
  single_family: ["status", "askingPrice", "soldPrice", "yearBuilt", "landArea", "buildingArea", "bedroomsTotal", "bathrooms", "garage", "parking", "municipalAssessment"],
  condo: ["status", "askingPrice", "soldPrice", "yearBuilt", "buildingArea", "bedroomsTotal", "bathrooms", "garage", "parking", "municipalAssessment"],
  farm: ["status", "askingPrice", "soldPrice", "yearBuilt", "landArea", "buildingArea", "bedroomsTotal", "bathrooms", "garage", "municipalAssessment"],
  commercial_industrial: ["status", "askingPrice", "soldPrice", "propertyType", "buildingType", "yearBuilt", "landArea", "buildingArea", "zoning", "municipalAssessment"],
  income_property: ["status", "askingPrice", "soldPrice", "yearBuilt", "numberOfUnits", "grossRevenue", "operatingExpenses", "netOperatingIncome", "grossRevenueMultiplier", "pricePerDoor", "municipalAssessment"],
  land: ["status", "askingPrice", "soldPrice", "landArea", "landDimensions", "zoning", "pricePerLandSquareFoot", "municipalAssessment"],
  multi_category: ["status", "askingPrice", "soldPrice", "propertyType", "yearBuilt", "landArea", "buildingArea", "zoning", "numberOfUnits", "grossRevenue", "municipalAssessment"],
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(value).replace(/[\u00a0\u202f]/g, " ");
}

function formatArea(area?: PropertyArea): string | null {
  if (!area?.value || !area.unit) return null;
  return `${formatNumber(area.value)} ${area.unit === "sqft" ? "pi²" : "m²"}`;
}

function formatDimensions(dimensions?: PropertyDimensions): string | null {
  if (!dimensions?.width || !dimensions.depth || !dimensions.unit) return null;
  return `${formatNumber(dimensions.width)} x ${formatNumber(dimensions.depth)} ${dimensions.unit === "ft" ? "pi" : "m"}`;
}

function addField(fields: ReportField[], label: string, value: string | number | null | undefined) {
  if (value === undefined || value === null || value === "") return;
  fields.push({ label, value: typeof value === "number" ? formatNumber(value) : value });
}

function getPrimaryPhoto(property: PropertyData): string | undefined {
  return property.photos?.find((photo) => /^data:image\/(png|jpe?g);base64,/i.test(photo));
}

function commonFields(data: PropertyData): ReportField[] {
  const fields: ReportField[] = [];
  addField(fields, "Numéro Centris", data.centrisNumber);
  addField(fields, "Type de propriété", data.propertyType ?? (data.propertyCategory ? PROPERTY_CATEGORY_LABELS[data.propertyCategory] : undefined));
  addField(fields, "Année de construction", formatYear(data.yearBuilt));
  addField(fields, "Superficie du terrain", formatArea(data.landArea));
  addField(fields, "Superficie du bâtiment", formatArea(data.buildingArea));
  return fields;
}

function subjectFields(data: PropertyData): ReportField[] {
  const fields = commonFields(data);
  if (data.propertyCategory === "income_property") {
    addField(fields, "Nombre d’unités", data.incomeProperty?.numberOfUnits);
    addField(fields, "Revenus bruts potentiels", data.incomeProperty?.grossPotentialRevenue ? formatCmaCurrency(data.incomeProperty.grossPotentialRevenue) : undefined);
    addField(fields, "Revenu net d’exploitation", data.incomeProperty?.netOperatingIncome ? formatCmaCurrency(data.incomeProperty.netOperatingIncome) : undefined);
    addField(fields, "MRB", data.incomeProperty?.grossRevenueMultiplier);
    addField(fields, "Loyers documentés", data.incomeProperty?.rents?.length);
  } else if (data.propertyCategory === "land") {
    addField(fields, "Dimensions", formatDimensions(data.landDimensions));
    addField(fields, "Zonage", data.zoning?.join(", "));
    addField(fields, "Cadastre", data.cadastre);
  } else {
    addField(fields, "Chambres", data.bedroomsTotal ?? data.bedrooms);
    addField(fields, "Salles de bains", data.bathrooms);
    addField(fields, "Garage", data.garage);
    addField(fields, "Stationnement", data.parking);
  }
  return fields;
}

function comparableFields(data: PropertyData): ReportField[] {
  const fields = commonFields(data);
  addField(fields, "Statut", data.status ? PROPERTY_STATUS_LABELS[data.status] : undefined);
  addField(fields, "Prix demandé", data.askingPrice ? formatCmaCurrency(data.askingPrice) : undefined);
  addField(fields, "Prix vendu", data.soldPrice ? formatCmaCurrency(data.soldPrice) : undefined);
  if (data.propertyCategory === "income_property") {
    addField(fields, "Nombre d’unités", data.incomeProperty?.numberOfUnits);
    addField(fields, "Revenus bruts potentiels", data.incomeProperty?.grossPotentialRevenue ? formatCmaCurrency(data.incomeProperty.grossPotentialRevenue) : undefined);
  } else {
    const bedrooms = data.bedroomsTotal ?? data.bedrooms;
    addField(fields, "Chambres / salles de bains", bedrooms !== undefined || data.bathrooms !== undefined ? `${bedrooms ?? "-"} / ${data.bathrooms ?? "-"}` : undefined);
    addField(fields, "Garage / stationnement", data.garage || data.parking !== undefined ? `${data.garage ?? "-"} / ${data.parking ?? "-"}` : undefined);
  }
  return fields;
}

function highlights(data: PropertyData): string[] {
  return [...(data.features ?? []), ...(data.zoning?.map((zone) => `Zonage ${zone}`) ?? [])].filter(Boolean).slice(0, 6);
}

function makePropertySection(property: CmaReportData["subject"]): ReportPropertySection {
  return {
    property,
    title: property.data.address ?? "Adresse non détectée",
    subtitle: [property.data.city, property.data.region].filter(Boolean).join(" · ") || undefined,
    primaryPhoto: getPrimaryPhoto(property.data),
    fields: subjectFields(property.data),
    highlights: highlights(property.data),
  };
}

function formatComparisonValue(value: string | number | null, rowId: string): string {
  if (value === null || value === "") return "-";
  if (rowId === "status" && typeof value === "string") return PROPERTY_STATUS_LABELS[value as keyof typeof PROPERTY_STATUS_LABELS] ?? value;
  if (rowId === "yearBuilt" && typeof value === "number") return formatYear(value) ?? "-";
  if (typeof value === "string") return value;
  if (["askingPrice", "soldPrice", "municipalAssessment", "pricePerDoor"].includes(rowId)) return formatCmaCurrency(value);
  if (["pricePerLandSquareFoot", "pricePerBuildingSquareFoot"].includes(rowId)) return `${formatCmaCurrency(value)} / pi²`;
  return formatNumber(value);
}

function buildComparisonRows(report: CmaReportData): ReportComparisonRow[] {
  const category = report.subject.data.propertyCategory ?? "single_family";
  const preferredIds = REPORT_ROW_IDS[category];
  const properties = [report.subject, ...report.comparables.map(({ property }) => property)];
  return getComparisonRows(category)
    .filter((row) => preferredIds.includes(row.id))
    .map((row) => ({
      id: row.id,
      label: row.label,
      values: properties.map((property) => formatComparisonValue(row.value(property.data, calculateDerivedMetrics(property.data)), row.id)),
    }));
}

export function prepareReportDocumentData(report: CmaReportData, preparedAt = new Date(), template: ReportTemplateId = "classic"): ReportDocumentData {
  const subject = makePropertySection(report.subject);
  const comparables: ReportComparableSection[] = report.comparables.map(({ property, analysis }) => ({
    property,
    analysis,
    title: property.data.address ?? `Centris ${property.data.centrisNumber ?? "non détecté"}`,
    subtitle: [property.data.city, property.data.status ? PROPERTY_STATUS_LABELS[property.data.status] : undefined].filter(Boolean).join(" · ") || undefined,
    primaryPhoto: getPrimaryPhoto(property.data),
    fields: comparableFields(property.data),
    highlights: highlights(property.data),
  }));

  return {
    template,
    fileName: createReportFileName(report.subject.data.address, report.subject.data.city),
    preparedDate: new Intl.DateTimeFormat("fr-CA", { year: "numeric", month: "long", day: "numeric" }).format(preparedAt),
    preparer: getReportPreparer(report.preparedBy),
    subject,
    comparables,
    comparisonRows: buildComparisonRows(report),
    statistics: report.statistics,
    opinion: report.opinion,
    source: report,
  };
}

export function describeReferencePrice(source: "sold_price" | "asking_price" | null): string {
  return source ? REFERENCE_PRICE_SOURCE_LABELS[source] : "Aucun prix de référence exploitable";
}

export function describeAdjustmentTotal(total: number): string {
  return formatSignedCurrency(total);
}
