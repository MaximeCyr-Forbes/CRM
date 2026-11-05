"use client";

import { Plus, Trash2 } from "lucide-react";
import type { PropertyCategory, PropertyData, RentData } from "@/app/lib/tools/acm/types";
import { PROPERTY_CATEGORY_LABELS, PROPERTY_STATUS_LABELS } from "../presentation";

type FieldKind = "text" | "number" | "date" | "textarea" | "list" | "select" | "checkbox";

interface EditorField {
  path: string;
  label: string;
  kind?: FieldKind;
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
}

interface EditorSection {
  title: string;
  fields: readonly EditorField[];
}

const categoryOptions = Object.entries(PROPERTY_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
const statusOptions = Object.entries(PROPERTY_STATUS_LABELS).map(([value, label]) => ({ value, label }));

const EDITOR_SECTIONS: readonly EditorSection[] = [
  {
    title: "Identification",
    fields: [
      { path: "centrisNumber", label: "Numéro Centris" },
      { path: "status", label: "Statut", kind: "select", options: statusOptions },
      { path: "address", label: "Adresse" },
      { path: "city", label: "Ville" },
      { path: "postalCode", label: "Code postal" },
      { path: "region", label: "Région" },
      { path: "neighborhood", label: "Quartier" },
      { path: "near", label: "Près de" },
      { path: "propertyCategory", label: "Catégorie", kind: "select", options: categoryOptions },
      { path: "propertyType", label: "Genre / type de propriété" },
      { path: "buildingType", label: "Type de bâtiment" },
    ],
  },
  {
    title: "Prix et marché",
    fields: [
      { path: "askingPrice", label: "Prix demandé", kind: "number" },
      { path: "soldPrice", label: "Prix vendu", kind: "number" },
      { path: "dateSold", label: "Date de vente", kind: "date" },
      { path: "daysOnMarket", label: "Jours sur le marché", kind: "number" },
      { path: "yearBuilt", label: "Année de construction", kind: "number" },
    ],
  },
  {
    title: "Terrain et bâtiment",
    fields: [
      { path: "buildingDimensions.width", label: "Largeur bâtiment", kind: "number" },
      { path: "buildingDimensions.depth", label: "Profondeur bâtiment", kind: "number" },
      { path: "buildingDimensions.unit", label: "Unité dimensions bâtiment", kind: "select", options: [{ value: "ft", label: "Pieds" }, { value: "m", label: "Mètres" }] },
      { path: "buildingArea.value", label: "Superficie bâtiment", kind: "number" },
      { path: "buildingArea.unit", label: "Unité superficie bâtiment", kind: "select", options: [{ value: "sqft", label: "Pi²" }, { value: "sqm", label: "M²" }] },
      { path: "livingArea.value", label: "Superficie habitable", kind: "number" },
      { path: "livingArea.unit", label: "Unité superficie habitable", kind: "select", options: [{ value: "sqft", label: "Pi²" }, { value: "sqm", label: "M²" }] },
      { path: "landDimensions.width", label: "Largeur terrain", kind: "number" },
      { path: "landDimensions.depth", label: "Profondeur terrain", kind: "number" },
      { path: "landDimensions.unit", label: "Unité dimensions terrain", kind: "select", options: [{ value: "ft", label: "Pieds" }, { value: "m", label: "Mètres" }] },
      { path: "landArea.value", label: "Superficie terrain", kind: "number" },
      { path: "landArea.unit", label: "Unité superficie terrain", kind: "select", options: [{ value: "sqft", label: "Pi²" }, { value: "sqm", label: "M²" }] },
    ],
  },
  {
    title: "Évaluation municipale",
    fields: [
      { path: "municipalAssessment.land", label: "Terrain", kind: "number" },
      { path: "municipalAssessment.building", label: "Bâtiment", kind: "number" },
      { path: "municipalAssessment.total", label: "Total", kind: "number" },
      { path: "municipalAssessment.year", label: "Année du rôle", kind: "number" },
      { path: "municipalTaxes", label: "Taxes municipales", kind: "number" },
      { path: "schoolTaxes", label: "Taxes scolaires", kind: "number" },
    ],
  },
  {
    title: "Caractéristiques",
    fields: [
      { path: "rooms", label: "Pièces", kind: "number" },
      { path: "bedroomsAboveGround", label: "Chambres hors-sol", kind: "number" },
      { path: "bedroomsBasement", label: "Chambres au sous-sol", kind: "number" },
      { path: "bedroomsTotal", label: "Chambres totales", kind: "number" },
      { path: "bathrooms", label: "Salles de bains", kind: "number" },
      { path: "powderRooms", label: "Salles d'eau", kind: "number" },
      { path: "parking", label: "Stationnements", kind: "number" },
      { path: "garage", label: "Garage" },
      { path: "pool", label: "Piscine" },
      { path: "basement", label: "Sous-sol" },
      { path: "foundation", label: "Fondation" },
      { path: "roof", label: "Toiture" },
      { path: "heatingEnergy", label: "Énergie de chauffage" },
      { path: "heating", label: "Chauffage", kind: "list", placeholder: "Séparer par des virgules" },
      { path: "heatPump", label: "Thermopompe" },
      { path: "waterSupply", label: "Approvisionnement en eau" },
      { path: "sewageSystem", label: "Égouts" },
      { path: "zoning", label: "Zonage", kind: "list" },
      { path: "cadastre", label: "Cadastre" },
      { path: "features", label: "Autres caractéristiques", kind: "list" },
    ],
  },
  {
    title: "Propriété à revenus",
    fields: [
      { path: "incomeProperty.numberOfUnits", label: "Nombre d'unités", kind: "number" },
      { path: "incomeProperty.residentialRevenue", label: "Revenus résidentiels", kind: "number" },
      { path: "incomeProperty.commercialRevenue", label: "Revenus commerciaux", kind: "number" },
      { path: "incomeProperty.grossPotentialRevenue", label: "Revenus bruts potentiels", kind: "number" },
      { path: "incomeProperty.operatingExpenses", label: "Dépenses d'exploitation", kind: "number" },
      { path: "incomeProperty.netOperatingIncome", label: "Revenu net d'exploitation", kind: "number" },
      { path: "incomeProperty.grossRevenueMultiplier", label: "Multiplicateur de revenu brut", kind: "number" },
      { path: "incomeProperty.pricePerDoor", label: "Prix par porte", kind: "number" },
      { path: "incomeProperty.otherStatistics.capitalizationRate", label: "Taux de capitalisation", kind: "number" },
      { path: "incomeProperty.otherStatistics.expenseRatio", label: "Ratio des dépenses", kind: "number" },
      { path: "incomeProperty.otherStatistics.pricePerSquareFoot", label: "Prix par pied carré", kind: "number" },
    ],
  },
  {
    title: "Texte et visuels",
    fields: [
      { path: "remarks", label: "Remarques", kind: "textarea" },
      { path: "addendum", label: "Addenda", kind: "textarea" },
      { path: "description", label: "Description", kind: "textarea" },
      { path: "photos", label: "Références de photos", kind: "list" },
      { path: "photoDetection.detected", label: "Visuels détectés", kind: "checkbox" },
      { path: "photoDetection.count", label: "Nombre de visuels détectés", kind: "number" },
    ],
  },
];

const COMPARISON_COMMON_FIELDS = new Set([
  "centrisNumber",
  "status",
  "address",
  "city",
  "postalCode",
  "propertyCategory",
  "propertyType",
  "buildingType",
  "askingPrice",
  "soldPrice",
  "yearBuilt",
  "municipalAssessment.land",
  "municipalAssessment.building",
  "municipalAssessment.total",
]);

const BUILDING_FIELDS = [
  "buildingDimensions.width",
  "buildingDimensions.depth",
  "buildingDimensions.unit",
  "buildingArea.value",
  "buildingArea.unit",
];

const LAND_FIELDS = [
  "landDimensions.width",
  "landDimensions.depth",
  "landDimensions.unit",
  "landArea.value",
  "landArea.unit",
];

const RESIDENTIAL_FIELDS = [
  "bedroomsTotal",
  "bathrooms",
  "powderRooms",
  "parking",
  "garage",
  "pool",
  "basement",
];

const MANUAL_COMMON_FIELDS = [
  "centrisNumber",
  "status",
  "address",
  "city",
  "postalCode",
  "region",
  "neighborhood",
  "propertyCategory",
  "propertyType",
  "buildingType",
  "askingPrice",
  "soldPrice",
  "yearBuilt",
  "municipalAssessment.land",
  "municipalAssessment.building",
  "municipalAssessment.total",
  "municipalAssessment.year",
  "cadastre",
  "zoning",
];

const MANUAL_BUILDING_FIELDS = [
  ...BUILDING_FIELDS,
  "livingArea.value",
  "livingArea.unit",
];

const MANUAL_SYSTEM_FIELDS = [
  "foundation",
  "roof",
  "heating",
  "heatingEnergy",
  "heatPump",
  "waterSupply",
  "sewageSystem",
];

function comparisonSections(category?: PropertyCategory): readonly EditorSection[] {
  const paths = new Set(COMPARISON_COMMON_FIELDS);

  if (category !== "condo" && category !== "land") LAND_FIELDS.forEach((path) => paths.add(path));
  if (category !== "land") BUILDING_FIELDS.forEach((path) => paths.add(path));
  if (category === "land") LAND_FIELDS.forEach((path) => paths.add(path));

  if (category !== "land") {
    const characteristicFields = category === "commercial_industrial"
      ? ["parking", "garage", "basement"]
      : RESIDENTIAL_FIELDS;
    characteristicFields.forEach((path) => paths.add(path));
  }

  if (category === "income_property" || category === "multi_category") {
    EDITOR_SECTIONS.find(({ title }) => title === "Propriété à revenus")?.fields.forEach(({ path }) => paths.add(path));
  }

  return EDITOR_SECTIONS
    .map((section) => ({ ...section, fields: section.fields.filter(({ path }) => paths.has(path)) }))
    .filter(({ fields }) => fields.length > 0);
}

function manualSections(category?: PropertyCategory): readonly EditorSection[] {
  const paths = new Set(MANUAL_COMMON_FIELDS);

  if (category !== "condo" && category !== "land") LAND_FIELDS.forEach((path) => paths.add(path));
  if (category !== "land") MANUAL_BUILDING_FIELDS.forEach((path) => paths.add(path));
  if (category === "land") LAND_FIELDS.forEach((path) => paths.add(path));

  if (category !== "land") {
    const characteristicFields = category === "commercial_industrial"
      ? ["parking", "garage", "basement"]
      : RESIDENTIAL_FIELDS;
    [...characteristicFields, ...MANUAL_SYSTEM_FIELDS].forEach((path) => paths.add(path));
  }

  if (category === "income_property" || category === "multi_category") {
    EDITOR_SECTIONS.find(({ title }) => title === "Propriété à revenus")?.fields.forEach(({ path }) => paths.add(path));
  }

  return EDITOR_SECTIONS
    .map((section) => ({ ...section, fields: section.fields.filter(({ path }) => paths.has(path)) }))
    .filter(({ fields }) => fields.length > 0);
}

export type PropertyEditorVariant = "full" | "comparison" | "manual";

function editorSections(variant: PropertyEditorVariant, category?: PropertyCategory): readonly EditorSection[] {
  if (variant === "comparison") return comparisonSections(category);
  if (variant === "manual") return manualSections(category);
  return EDITOR_SECTIONS;
}

export function getPropertyEditorFieldPaths(variant: PropertyEditorVariant, category?: PropertyCategory): string[] {
  return editorSections(variant, category).flatMap(({ fields }) => fields.map(({ path }) => path));
}

function getDeepValue(record: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, record);
}

function setDeepValue(data: PropertyData, path: string, value: unknown): PropertyData {
  const clone = structuredClone(data) as Record<string, unknown>;
  const keys = path.split(".");
  let cursor = clone;

  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      if (value === undefined || value === "") delete cursor[key];
      else cursor[key] = value;
      return;
    }

    if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  });

  return clone as PropertyData;
}

function inputValue(value: unknown, kind: FieldKind): string | number {
  if (kind === "list" && Array.isArray(value)) return value.join(", ");
  if (typeof value === "number" || typeof value === "string") return value;
  return "";
}

interface PropertyEditorProps {
  idPrefix: string;
  value: PropertyData;
  onChange: (value: PropertyData) => void;
  variant?: PropertyEditorVariant;
}

export function PropertyEditor({ idPrefix, value, onChange, variant = "full" }: PropertyEditorProps) {
  function updateField(field: EditorField, rawValue: string | boolean) {
    let nextValue: unknown = rawValue;
    if (field.kind === "number") nextValue = rawValue === "" ? undefined : Number(rawValue);
    if (field.kind === "list") nextValue = String(rawValue).split(",").map((item) => item.trim()).filter(Boolean);
    onChange(setDeepValue(value, field.path, nextValue));
  }

  function updateRents(rents: RentData[]) {
    onChange(setDeepValue(value, "incomeProperty.rents", rents.length > 0 ? rents : undefined));
  }

  const rents = value.incomeProperty?.rents ?? [];
  const sections = editorSections(variant, value.propertyCategory);

  return (
    <div className={`property-editor property-editor--${variant}`}>
      {sections.map((section) => (
        <fieldset className="editor-section" key={section.title}>
          <legend>{section.title}</legend>
          <div className="editor-grid">
            {section.fields.map((field) => {
              const kind = field.kind ?? "text";
              const currentValue = getDeepValue(value, field.path);
              const fieldId = `property-${idPrefix}-${field.path.replace(/\./g, "-")}`;

              return (
                <label className={`editor-field${kind === "textarea" ? " editor-field--wide" : ""}${kind === "checkbox" ? " editor-field--checkbox" : ""}`} key={field.path} htmlFor={fieldId}>
                  <span>{field.label}</span>
                  {kind === "select" ? (
                    <select id={fieldId} value={String(currentValue ?? "")} onChange={(event) => updateField(field, event.target.value)}>
                      <option value="">Non détecté</option>
                      {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : kind === "textarea" ? (
                    <textarea id={fieldId} rows={4} value={String(currentValue ?? "")} onChange={(event) => updateField(field, event.target.value)} />
                  ) : kind === "checkbox" ? (
                    <input id={fieldId} type="checkbox" checked={Boolean(currentValue)} onChange={(event) => updateField(field, event.target.checked)} />
                  ) : (
                    <input
                      id={fieldId}
                      type={kind === "number" ? "number" : kind === "date" ? "date" : "text"}
                      step={kind === "number" ? "any" : undefined}
                      value={inputValue(currentValue, kind)}
                      placeholder={field.placeholder}
                      onChange={(event) => updateField(field, event.target.value)}
                    />
                  )}
                </label>
              );
            })}
          </div>

          {section.title === "Propriété à revenus" && (
            <div className="rent-editor">
              <div className="rent-editor__header">
                <strong>Loyers</strong>
                <button type="button" onClick={() => updateRents([...rents, {}])}><Plus size={14} /> Ajouter un loyer</button>
              </div>
              {rents.map((rent, index) => (
                <div className="rent-row" key={`rent-${index}`}>
                  <input aria-label={`Unité ${index + 1}`} placeholder="Unité" value={rent.unit ?? ""} onChange={(event) => updateRents(rents.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value || undefined } : item))} />
                  <input aria-label={`Loyer mensuel ${index + 1}`} placeholder="Loyer mensuel" type="number" value={rent.monthlyRent ?? ""} onChange={(event) => updateRents(rents.map((item, itemIndex) => itemIndex === index ? { ...item, monthlyRent: event.target.value ? Number(event.target.value) : undefined } : item))} />
                  <input aria-label={`Fin du bail ${index + 1}`} type="date" value={rent.leaseEndDate ?? ""} onChange={(event) => updateRents(rents.map((item, itemIndex) => itemIndex === index ? { ...item, leaseEndDate: event.target.value || undefined } : item))} />
                  <input aria-label={`Notes du loyer ${index + 1}`} placeholder="Notes" value={rent.notes ?? ""} onChange={(event) => updateRents(rents.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value || undefined } : item))} />
                  <button type="button" aria-label={`Supprimer le loyer ${index + 1}`} onClick={() => updateRents(rents.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </fieldset>
      ))}
    </div>
  );
}
