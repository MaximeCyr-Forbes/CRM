import type { CentrisExtraction } from "./centris-types";

const EXPENSE_LABELS = {
  municipalTaxes: "Taxes municipales",
  schoolTaxes: "Taxes scolaires",
  insurance: "Assurance",
  lawn: "Gazon",
  snowRemoval: "Déneigement",
  maintenance: "Entretien",
  repairs: "Réparations",
  electricity: "Électricité",
  heating: "Chauffage",
  management: "Gestion (% des revenus bruts)",
  other: "Autres dépenses",
} as const;

type ExpenseKey = keyof typeof EXPENSE_LABELS;

interface ImportTargetUnit {
  id: string;
  description: string;
  currentMonthlyRent: number;
  potentialMonthlyRent: number;
  customMonthlyRent: number;
  status: string;
  otherMonthlyIncome: number;
}

interface ImportTargetData {
  property: {
    address: string;
    propertyType: string;
    unitCount: number;
    askingPrice: number;
    analyzedPrice: number;
  };
  expenses: Record<ExpenseKey, number>;
  revenues: ImportTargetUnit[];
}

export interface PdfImportApplication<T> {
  data: T;
  protectedLabels: string[];
  analyzedPriceInitialized: boolean;
}

function normalizedPropertyType(value: string): string {
  const type = value.toLowerCase();
  if (type.includes("duplex")) return "Duplex";
  if (type.includes("triplex")) return "Triplex";
  if (type.includes("plex")) return "Multiplex";
  return "Autre";
}

/**
 * Transfère uniquement les valeurs explicitement extraites. Les anciennes
 * données non présentes dans le PDF sont remises à zéro,
 * sauf lorsqu'elles ont été corrigées manuellement.
 */
export function applyCentrisExtraction<T extends ImportTargetData>(
  current: T,
  extraction: CentrisExtraction,
  manualEdits: ReadonlySet<string>,
): PdfImportApplication<T> {
  const next = structuredClone(current);
  const protectedLabels = new Set<string>();
  const canApply = (key: string, label: string) => {
    if (!manualEdits.has(key)) return true;
    protectedLabels.add(label);
    return false;
  };

  if (extraction.address.value && canApply("property.address", "Adresse")) next.property.address = extraction.address.value;
  if (extraction.propertyType.value && canApply("property.propertyType", "Type d’immeuble")) next.property.propertyType = normalizedPropertyType(extraction.propertyType.value);
  if (extraction.unitCount.value !== null && canApply("property.unitCount", "Nombre de logements")) next.property.unitCount = extraction.unitCount.value;
  if (extraction.askingPrice.value !== null && canApply("property.askingPrice", "Prix demandé")) next.property.askingPrice = extraction.askingPrice.value;
  const analyzedPriceInitialized = extraction.askingPrice.value !== null && canApply("property.analyzedPrice", "Prix d’achat analysé");
  if (analyzedPriceInitialized) next.property.analyzedPrice = extraction.askingPrice.value!;

  (Object.keys(EXPENSE_LABELS) as ExpenseKey[]).forEach((key) => {
    if (canApply(`expense.${key}`, EXPENSE_LABELS[key])) next.expenses[key] = 0;
  });
  const expenseValues: Partial<Record<ExpenseKey, number | null>> = {
    municipalTaxes: extraction.municipalTaxes.value,
    schoolTaxes: extraction.schoolTaxes.value,
  };
  extraction.expenses.forEach((expense) => {
    if (expense.key in EXPENSE_LABELS) expenseValues[expense.key as ExpenseKey] = expense.value;
  });
  Object.entries(expenseValues).forEach(([rawKey, value]) => {
    const key = rawKey as ExpenseKey;
    if (value !== null && value !== undefined && !manualEdits.has(`expense.${key}`)) next.expenses[key] = value;
  });

  extraction.units.forEach((unit, index) => {
    const existing = next.revenues[index];
    if (!existing) {
      next.revenues.push({
        id: `pdf-unit-${index + 1}`,
        description: unit.description.value ?? "Information manquante",
        currentMonthlyRent: unit.currentMonthlyRent.value ?? 0,
        potentialMonthlyRent: unit.potentialMonthlyRent.value ?? 0,
        customMonthlyRent: 0,
        status: unit.occupancyStatus.value ?? "",
        otherMonthlyIncome: 0,
      } as T["revenues"][number]);
      return;
    }
    if (canApply(`revenue.${existing.id}.description`, unit.description.label)) existing.description = unit.description.value ?? "Information manquante";
    if (canApply(`revenue.${existing.id}.currentMonthlyRent`, unit.currentMonthlyRent.label)) existing.currentMonthlyRent = unit.currentMonthlyRent.value ?? 0;
    if (canApply(`revenue.${existing.id}.potentialMonthlyRent`, unit.potentialMonthlyRent.label)) existing.potentialMonthlyRent = unit.potentialMonthlyRent.value ?? 0;
    if (canApply(`revenue.${existing.id}.status`, unit.occupancyStatus.label)) existing.status = unit.occupancyStatus.value ?? "";
    if (canApply(`revenue.${existing.id}.customMonthlyRent`, `Loyer personnalisé du logement ${index + 1}`)) existing.customMonthlyRent = 0;
    if (canApply(`revenue.${existing.id}.otherMonthlyIncome`, `Autres revenus du logement ${index + 1}`)) existing.otherMonthlyIncome = 0;
  });

  next.revenues = next.revenues.filter((row, index) => {
    if (index < extraction.units.length) return true;
    const preserved = ["description", "currentMonthlyRent", "potentialMonthlyRent", "customMonthlyRent", "status", "otherMonthlyIncome"].some((field) => manualEdits.has(`revenue.${row.id}.${field}`));
    if (preserved) protectedLabels.add(`Logement ${index + 1}`);
    return preserved;
  }) as T["revenues"];

  return { data: next, protectedLabels: [...protectedLabels], analyzedPriceInitialized };
}
