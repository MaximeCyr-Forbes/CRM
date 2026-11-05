import {
  flattenCentrisExtraction,
  type CentrisExtraction,
  type ExtractedField,
} from "@/app/lib/tools/plex/infrastructure/pdf";

export type PdfReviewExpenseKey =
  | "municipalTaxes"
  | "schoolTaxes"
  | "insurance"
  | "lawn"
  | "snowRemoval"
  | "maintenance"
  | "repairs"
  | "electricity"
  | "heating"
  | "management"
  | "other";

type PdfReviewExpenses = Readonly<Record<PdfReviewExpenseKey, number>>;

export interface PdfReviewRow {
  field: ExtractedField<unknown>;
  manualValue?: number;
}

const EXPENSE_REVIEW_FIELDS: ReadonlyArray<{
  expenseKey: PdfReviewExpenseKey;
  fieldKey: string;
  label: string;
}> = [
  { expenseKey: "municipalTaxes", fieldKey: "municipal-taxes", label: "Taxes municipales" },
  { expenseKey: "schoolTaxes", fieldKey: "school-taxes", label: "Taxes scolaires" },
  { expenseKey: "insurance", fieldKey: "insurance", label: "Assurance" },
  { expenseKey: "lawn", fieldKey: "lawn", label: "Gazon" },
  { expenseKey: "snowRemoval", fieldKey: "snowRemoval", label: "Déneigement" },
  { expenseKey: "maintenance", fieldKey: "maintenance", label: "Entretien" },
  { expenseKey: "repairs", fieldKey: "repairs", label: "Réparations" },
  { expenseKey: "electricity", fieldKey: "electricity", label: "Électricité" },
  { expenseKey: "heating", fieldKey: "heating", label: "Chauffage" },
  { expenseKey: "management", fieldKey: "management", label: "Gestion (% des revenus bruts)" },
  { expenseKey: "other", fieldKey: "other", label: "Autres dépenses" },
];

const expenseByFieldKey = new Map(
  EXPENSE_REVIEW_FIELDS.map((entry) => [entry.fieldKey, entry]),
);

function isUnitDetailFieldKey(key: string): boolean {
  return /^unit-.+-(?:description|current-rent|potential-rent)$/.test(key);
}

/**
 * Prépare uniquement les lignes d'affichage du bilan d'importation.
 * Les données extraites et les dépenses de la calculatrice ne sont jamais
 * modifiées ni additionnées une seconde fois.
 */
export function buildPdfReviewRows(
  extraction: CentrisExtraction,
  expenses: PdfReviewExpenses,
  manualEdits: ReadonlySet<string>,
): PdfReviewRow[] {
  const rows = flattenCentrisExtraction(extraction)
    .filter((field) => field.key !== "address" && !isUnitDetailFieldKey(field.key))
    .map((field): PdfReviewRow => {
      const expense = expenseByFieldKey.get(field.key);
      if (!expense || !manualEdits.has(`expense.${expense.expenseKey}`)) {
        return { field };
      }
      return { field, manualValue: expenses[expense.expenseKey] };
    });

  const missingManualExpenseRows = EXPENSE_REVIEW_FIELDS
    .filter(
      (expense) =>
        manualEdits.has(`expense.${expense.expenseKey}`) &&
        !rows.some((row) => row.field.key === expense.fieldKey),
    )
    .map((expense): PdfReviewRow => ({
      field: {
        key: expense.fieldKey,
        label: expense.label,
        value: null,
        confidence: "none",
        page: null,
        status: "missing",
      },
      manualValue: expenses[expense.expenseKey],
    }));

  rows.push(...missingManualExpenseRows);

  return rows;
}
